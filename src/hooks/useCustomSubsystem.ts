/**
 * App-wide wrapper around `@cormoran/zmk-studio-react-hook`'s
 * `useCustomSubsystem` that gives every custom subsystem a generous *fixed*
 * per-RPC timeout.
 *
 * Custom-subsystem calls are wrapped in a timeout (the official `call_rpc` is
 * not), defaulting to 5s. Over slow BLE a single call can exceed that; when it
 * does, the timed-out call abandons the shared RPC mutex mid-read, desyncing
 * the response stream and cascading into "No response" errors across the app.
 * 5s is simply too tight for BLE, so every custom subsystem gets a generous
 * default here. Callers may still pass an explicit `timeout` to override it.
 *
 * We also pin `lastPacketMs: undefined` on every call. The library otherwise
 * injects the connection's global last-packet timestamp, which turns the
 * timeout into a *sliding inactivity window* that resets on **any** transport
 * byte — not just this call's response. With unrelated traffic flowing (RPC
 * debug/log streaming, input-event notifications, other subsystems), a request
 * the device never actually answers keeps having its window pushed out and so
 * *never times out*: the awaiting hook's `finally` never runs and its loading
 * indicator spins forever. Forcing `lastPacketMs: undefined` selects the
 * library's fixed-deadline `withTimeout`, so the call is guaranteed to settle
 * (resolve or reject) within `timeout` ms and the timeout is reflected to the
 * UI regardless of background chatter.
 *
 * All app hooks should import `useCustomSubsystem` from here rather than from
 * the library directly, so this uniform timeout behavior applies everywhere.
 */
import { useCallback } from "react";
import {
  useCustomSubsystem as libUseCustomSubsystem,
  type Codec,
  type UseCustomSubsystemReturn,
  type UseCustomSubsystemTypedReturn,
} from "@cormoran/zmk-studio-react-hook";
import { logRpc } from "../lib/rpcLogging";

/** Default per-RPC timeout (ms) applied to every custom-subsystem call. */
export const DEFAULT_CUSTOM_SUBSYSTEM_TIMEOUT_MS = 30_000;

/**
 * Options accepted by the library's `callRPC`. Its public type only exposes
 * `timeout`, but the runtime also honors `lastPacketMs` (it injects the
 * connection's global last-packet clock by default). We set it explicitly to
 * `undefined` — see the file header for why — which requires naming the field
 * the public type omits.
 */
type BaseCallRpcOptions = {
  timeout?: number;
  lastPacketMs?: (() => number) | undefined;
};

/**
 * Build the options passed to the library's `callRPC` for every app call:
 * a generous fixed timeout, `lastPacketMs` pinned to `undefined` so the timeout
 * is a fixed deadline rather than a traffic-resettable inactivity window, and
 * any caller overrides applied last. Typed as a variable (not an inline
 * literal) so it stays assignable to the library's narrower public param type
 * despite naming `lastPacketMs`.
 */
function baseCallOptions(options?: { timeout?: number }): BaseCallRpcOptions {
  return {
    timeout: DEFAULT_CUSTOM_SUBSYSTEM_TIMEOUT_MS,
    lastPacketMs: undefined,
    ...options,
  };
}

export function useCustomSubsystem(
  identifier: string,
): UseCustomSubsystemReturn;
export function useCustomSubsystem<TReq, TRes>(
  identifier: string,
  codec: Codec<TReq, TRes>,
): UseCustomSubsystemTypedReturn<TReq, TRes>;
export function useCustomSubsystem<TReq, TRes>(
  identifier: string,
  codec?: Codec<TReq, TRes>,
): UseCustomSubsystemReturn | UseCustomSubsystemTypedReturn<TReq, TRes> {
  // The library handles an undefined codec (returns without `call`).
  const base = libUseCustomSubsystem(
    identifier,
    codec as Codec<TReq, TRes>,
  ) as UseCustomSubsystemTypedReturn<TReq, TRes>;

  const baseCallRPC = base.callRPC;
  const baseCall = base.call as
    | UseCustomSubsystemTypedReturn<TReq, TRes>["call"]
    | undefined;

  const callRPC = useCallback<UseCustomSubsystemReturn["callRPC"]>(
    (payload, options) =>
      logRpc(
        `custom:${identifier}`,
        payload,
        () => baseCallRPC(payload, baseCallOptions(options)),
        {
          request: () => payload.byteLength,
          response: (res) => res?.byteLength,
        },
      ),
    [baseCallRPC, identifier],
  );

  const call = useCallback(
    (request: TReq, options?: { timeout?: number }) => {
      // Reimplement the library's typed call (encode → callRPC → decode)
      // ourselves rather than delegating to `base.call`, so we can log the
      // exact request/response payload sizes; the encode below is the same work
      // `base.call` would do internally, not extra overhead.
      const payload = codec!.encode(request);
      let responseBytes: number | undefined;
      return logRpc(
        `custom:${identifier}`,
        request,
        async () => {
          const responsePayload = await baseCallRPC(
            payload,
            baseCallOptions(options),
          );
          responseBytes = responsePayload?.byteLength;
          return responsePayload === null
            ? null
            : codec!.decode(responsePayload);
        },
        {
          request: () => payload.byteLength,
          response: () => responseBytes,
        },
      );
    },
    [baseCallRPC, codec, identifier],
  );

  return baseCall
    ? { subsystem: base.subsystem, ready: base.ready, callRPC, call }
    : { subsystem: base.subsystem, ready: base.ready, callRPC };
}
