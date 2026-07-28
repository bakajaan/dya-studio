/**
 * Save 時の自動スナップショット。
 *
 * 手動でスナップショットを残すのは忘れるので、キーマップを実機に書き込む
 * タイミングで自動に 1 世代残す。同じ内容の連発や短時間の連打で履歴が
 * 埋まらないよう、内容差分と最小間隔でガードする。
 */
import {
  addSnapshot,
  listSnapshots,
  type KeymapSnapshot,
  type SnapshotLayer,
} from "./keymapSnapshots";

export const AUTO_SNAPSHOT_ENABLED_KEY = "dya-studio-auto-snapshot-enabled";
/** この間隔より短い連続 Save では自動スナップショットを作らない */
export const AUTO_SNAPSHOT_MIN_INTERVAL_MS = 60_000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** 未設定の場合は有効（履歴が残って困ることはないため）。 */
export function isAutoSnapshotEnabled(storage: StorageLike): boolean {
  try {
    const raw = storage.getItem(AUTO_SNAPSHOT_ENABLED_KEY);
    if (raw === null) return true;
    return raw !== "false";
  } catch {
    return true;
  }
}

export function setAutoSnapshotEnabled(
  storage: StorageLike,
  enabled: boolean,
): void {
  try {
    storage.setItem(AUTO_SNAPSHOT_ENABLED_KEY, enabled ? "true" : "false");
  } catch {
    // 保存できない場合は既定動作（有効）のまま。
  }
}

/** バインディングが完全に一致しているか（ラベルは見ない）。 */
export function layersEqual(
  a: readonly SnapshotLayer[],
  b: readonly SnapshotLayer[],
): boolean {
  if (a.length !== b.length) return false;
  for (let layerIndex = 0; layerIndex < a.length; layerIndex += 1) {
    const left = a[layerIndex];
    const right = b[layerIndex];
    if (left.bindings.length !== right.bindings.length) return false;
    for (let index = 0; index < left.bindings.length; index += 1) {
      const lb = left.bindings[index];
      const rb = right.bindings[index];
      if (
        lb.behaviorId !== rb.behaviorId ||
        lb.param1 !== rb.param1 ||
        lb.param2 !== rb.param2
      ) {
        return false;
      }
    }
  }
  return true;
}

export type AutoSnapshotReason =
  | "ok"
  | "disabled"
  | "empty"
  | "no-changes"
  | "too-soon";

export interface AutoSnapshotDecision {
  shouldSnapshot: boolean;
  reason: AutoSnapshotReason;
}

export function evaluateAutoSnapshot(input: {
  enabled: boolean;
  latest: KeymapSnapshot | undefined;
  layers: readonly SnapshotLayer[];
  now: Date;
  minIntervalMs?: number;
}): AutoSnapshotDecision {
  const minIntervalMs = input.minIntervalMs ?? AUTO_SNAPSHOT_MIN_INTERVAL_MS;
  if (!input.enabled) return { shouldSnapshot: false, reason: "disabled" };
  if (input.layers.length === 0) {
    return { shouldSnapshot: false, reason: "empty" };
  }
  if (input.latest) {
    if (layersEqual(input.latest.layers, input.layers)) {
      return { shouldSnapshot: false, reason: "no-changes" };
    }
    const elapsed = input.now.getTime() - Date.parse(input.latest.savedAt);
    if (Number.isFinite(elapsed) && elapsed >= 0 && elapsed < minIntervalMs) {
      return { shouldSnapshot: false, reason: "too-soon" };
    }
  }
  return { shouldSnapshot: true, reason: "ok" };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 「自動保存 2026-07-28 11:20」のようなノート。 */
export function buildAutoSnapshotNote(now: Date, suffix?: string): string {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return suffix ? `自動保存 ${stamp} (${suffix})` : `自動保存 ${stamp}`;
}

/**
 * 条件を満たしていれば自動スナップショットを作成して返す。
 * 作らなかった場合は null。
 */
export function maybeAutoSnapshot(
  storage: StorageLike & Pick<Storage, "getItem" | "setItem">,
  input: {
    deviceName: string;
    layers: SnapshotLayer[];
    noteSuffix?: string;
    minIntervalMs?: number;
  },
  now: Date = new Date(),
  random: () => number = Math.random,
): KeymapSnapshot | null {
  const decision = evaluateAutoSnapshot({
    enabled: isAutoSnapshotEnabled(storage),
    latest: listSnapshots(storage)[0],
    layers: input.layers,
    now,
    minIntervalMs: input.minIntervalMs,
  });
  if (!decision.shouldSnapshot) return null;

  return addSnapshot(
    storage,
    {
      note: buildAutoSnapshotNote(now, input.noteSuffix),
      deviceName: input.deviceName,
      layers: input.layers,
    },
    now,
    random,
  );
}
