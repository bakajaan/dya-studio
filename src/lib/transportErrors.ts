/**
 * Transport-level error descriptions.
 *
 * Web Bluetooth (and, less often, Web Serial) surfaces raw browser exceptions
 * such as:
 *
 *   Failed to execute 'writeValue' on 'BluetoothRemoteGATTCharacteristic':
 *   GATT Server is disconnected. Cannot perform GATT operations. (Re)connect
 *   first with `device.gatt.connect`.
 *
 * Showing that verbatim in the UI is not actionable: it says nothing about WHY
 * the link dropped (usually the keyboard itself reset/crashed, or it went out
 * of range) nor what the user should do next. These helpers classify the raw
 * error and return a short bilingual explanation plus the next step, so hooks
 * can surface something useful instead of the browser's wording.
 *
 * Only the message text is inspected: the browser reports these as generic
 * NetworkError/DOMException instances without a stable machine-readable code,
 * so string matching is the only option available to us.
 */

export type TransportErrorKind =
  | "disconnected"
  | "transient-gatt"
  | "stream-locked"
  | "timeout"
  | "other";

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return "";
}

/**
 * Classify a raw transport/RPC error.
 *
 * - `disconnected`: the link is gone (keyboard reset, powered off, or out of
 *   range). Nothing can be retried until the user reconnects.
 * - `transient-gatt`: the OS Bluetooth stack failed one operation without a
 *   reason. The link is still up; retrying usually works (the GATT write retry
 *   patch in vite.config.ts already retries these internally, so seeing one
 *   here means even the retries failed).
 * - `stream-locked`: the shared request/response stream was left locked by an
 *   earlier aborted call (the call_rpc try/finally patch prevents this; kept
 *   for safety).
 * - `timeout`: no response arrived within the watchdog window.
 */
export function classifyTransportError(err: unknown): TransportErrorKind {
  const message = errorMessage(err);
  if (!message) return "other";
  if (
    /GATT Server is disconnected|Cannot perform GATT operations|device\.gatt\.connect|device has been lost|GATT Server not connected|NetworkError/i.test(
      message,
    )
  ) {
    return "disconnected";
  }
  if (/GATT operation failed/i.test(message)) return "transient-gatt";
  if (/(Writable|Readable)Stream is locked|already locked/i.test(message)) {
    return "stream-locked";
  }
  if (/timed out|timeout/i.test(message)) return "timeout";
  return "other";
}

/** True when the error means the keyboard link is gone and must be re-established. */
export function isTransportDisconnectError(err: unknown): boolean {
  return classifyTransportError(err) === "disconnected";
}

const MESSAGES: Record<
  Exclude<TransportErrorKind, "other">,
  { en: string; ja: string }
> = {
  disconnected: {
    en: "The connection to the keyboard was lost, so the operation could not be completed. This usually means the keyboard reset itself or went out of range. Reconnect it and try again.",
    ja: "キーボードとの接続が切れたため、処理を完了できませんでした。キーボード側が再起動したか、電波が届かなくなった可能性があります。再接続してお試しください。",
  },
  "transient-gatt": {
    en: "A Bluetooth operation failed without a specific reason (a known Web Bluetooth quirk). The connection is still up \u2014 wait a moment and try again.",
    ja: "Bluetoothの通信が一時的に失敗しました（Web Bluetoothの既知の不安定挙動）。接続は維持されていますので、少し待ってから再度お試しください。",
  },
  "stream-locked": {
    en: "A previous request was interrupted and the communication channel is still busy. Wait a moment and try again; reconnect if it keeps happening.",
    ja: "前のリクエストが中断され、通信チャンネルが使用中のままになっています。少し待ってから再度お試しください（続く場合は再接続してください）。",
  },
  timeout: {
    en: "The keyboard did not respond in time. It may be busy or may have reset; try again, and reconnect if it keeps happening.",
    ja: "キーボードからの応答が時間内に得られませんでした。処理中か再起動した可能性があります。再度お試しいただき、続く場合は再接続してください。",
  },
};

/**
 * Human-readable description for a transport/RPC error.
 *
 * Returns the classified explanation when the error is a known transport
 * failure; otherwise falls back to `fallback` (when given) or the raw message,
 * so genuinely unexpected errors are still visible for debugging.
 */
export function describeRpcError(
  err: unknown,
  language: string,
  fallback?: string,
): string {
  const kind = classifyTransportError(err);
  if (kind !== "other") {
    const text = MESSAGES[kind];
    return language === "ja" ? text.ja : text.en;
  }
  const message = errorMessage(err);
  if (message) return message;
  return (
    fallback ??
    (language === "ja" ? "不明なエラーが発生しました。" : "Unknown error")
  );
}
