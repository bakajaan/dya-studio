/**
 * BLE 再接続にかかった時間の自動計測ログ。
 *
 * jisaku_1 の最優先課題は「スリープからの復帰待ち時間」だが、体感でしか
 * 評価できていない。接続開始から接続完了までを毎回記録して中央値・p90 を
 * 出すことで、設定変更（コネクションインターバル等）の効果を数値で比較できる
 * ようにする。
 *
 * 永続化は注入した Storage 互換オブジェクト経由なので単体テスト可能。
 */

export type ReconnectTransport = "ble" | "usb" | "unknown";
export type ReconnectTrigger = "auto" | "manual" | "wake";
export type ReconnectOutcome = "connected" | "failed" | "cancelled";

export interface ReconnectEvent {
  id: string;
  /** ISO8601 */
  startedAt: string;
  durationMs: number;
  transport: ReconnectTransport;
  trigger: ReconnectTrigger;
  outcome: ReconnectOutcome;
  deviceKey: string;
  /** 失敗時のエラー種別など */
  note?: string;
}

export const RECONNECT_STORAGE_KEY = "dya-studio-reconnect-log";
export const RECONNECT_LIMIT = 300;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function isReconnectEvent(value: unknown): value is ReconnectEvent {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<ReconnectEvent>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.startedAt === "string" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.deviceKey === "string"
  );
}

export function listReconnectEvents(storage: StorageLike): ReconnectEvent[] {
  try {
    const raw = storage.getItem(RECONNECT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isReconnectEvent);
  } catch {
    return [];
  }
}

export function recordReconnectEvent(
  storage: StorageLike,
  input: {
    startedAt: Date;
    durationMs: number;
    transport: ReconnectTransport;
    trigger: ReconnectTrigger;
    outcome: ReconnectOutcome;
    deviceKey: string;
    note?: string;
  },
  random: () => number = Math.random,
): ReconnectEvent {
  const event: ReconnectEvent = {
    id: `${input.startedAt.getTime().toString(36)}-${Math.floor(
      random() * 1679616,
    ).toString(36)}`,
    startedAt: input.startedAt.toISOString(),
    durationMs: Math.max(0, Math.round(input.durationMs)),
    transport: input.transport,
    trigger: input.trigger,
    outcome: input.outcome,
    deviceKey: input.deviceKey,
    note: input.note,
  };
  const next = [event, ...listReconnectEvents(storage)].slice(
    0,
    RECONNECT_LIMIT,
  );
  try {
    storage.setItem(RECONNECT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // 保存できなくても接続自体には影響させない。
  }
  return event;
}

export function clearReconnectEvents(storage: StorageLike): void {
  try {
    storage.removeItem(RECONNECT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export interface ReconnectSummary {
  /** 対象となった試行回数（成功・失敗の合計） */
  attempts: number;
  successes: number;
  successRate: number;
  /** 成功した試行のみで集計（ミリ秒） */
  medianMs: number | null;
  meanMs: number | null;
  p90Ms: number | null;
  bestMs: number | null;
  worstMs: number | null;
  /** 直近の成功時間 */
  latestMs: number | null;
}

function percentile(sortedValues: number[], ratio: number): number | null {
  if (sortedValues.length === 0) return null;
  const rank = Math.ceil(ratio * sortedValues.length);
  const index = Math.min(sortedValues.length - 1, Math.max(0, rank - 1));
  return sortedValues[index];
}

export function summarizeReconnects(
  events: readonly ReconnectEvent[],
  filter: {
    transport?: ReconnectTransport;
    deviceKey?: string;
    since?: Date;
  } = {},
): ReconnectSummary {
  const sinceMs = filter.since ? filter.since.getTime() : null;
  const target = events.filter((event) => {
    if (filter.transport && event.transport !== filter.transport) return false;
    if (filter.deviceKey && event.deviceKey !== filter.deviceKey) return false;
    if (sinceMs !== null && Date.parse(event.startedAt) < sinceMs) return false;
    return event.outcome !== "cancelled";
  });

  const successes = target.filter((event) => event.outcome === "connected");
  const durations = successes
    .map((event) => event.durationMs)
    .sort((a, b) => a - b);

  const latest = successes
    .slice()
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];

  return {
    attempts: target.length,
    successes: successes.length,
    successRate: target.length > 0 ? successes.length / target.length : 0,
    medianMs: percentile(durations, 0.5),
    meanMs:
      durations.length > 0
        ? durations.reduce((sum, value) => sum + value, 0) / durations.length
        : null,
    p90Ms: percentile(durations, 0.9),
    bestMs: durations[0] ?? null,
    worstMs: durations[durations.length - 1] ?? null,
    latestMs: latest ? latest.durationMs : null,
  };
}

/**
 * 接続開始時に作り、完了/失敗時に finish() を呼ぶだけで記録できるタイマー。
 * now() を差し替えられるのでテストしやすい。
 */
export function startReconnectTimer(
  storage: StorageLike,
  input: {
    transport: ReconnectTransport;
    trigger: ReconnectTrigger;
    deviceKey: string;
  },
  now: () => number = () => Date.now(),
): {
  finish: (
    outcome: ReconnectOutcome,
    note?: string,
  ) => ReconnectEvent | null;
} {
  const startedAtMs = now();
  let finished = false;
  return {
    finish(outcome, note) {
      if (finished) return null;
      finished = true;
      return recordReconnectEvent(storage, {
        startedAt: new Date(startedAtMs),
        durationMs: now() - startedAtMs,
        transport: input.transport,
        trigger: input.trigger,
        outcome,
        deviceKey: input.deviceKey,
        note,
      });
    },
  };
}

/** 「1.8秒」「820ms」のような表示用テキスト。 */
export function formatDurationMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}秒`;
}
