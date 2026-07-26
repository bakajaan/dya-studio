/**
 * バッテリー履歴のローカル保存（localStorage）。
 *
 * キーボード本体のリングバッファは上限件数で古い値が消えていくため、
 * 取得した履歴をブラウザ側にも蓄積して長期のグラフ（充電で上がる/
 * 使って下がる推移）を見られるようにする。
 *
 * ファームウェアの timestamp は、時刻同期前は「起動からの秒数」なので
 * セッションをまたいで比較できない。保存前に toAbsoluteTimestamps() で
 * 取得時刻を基準にしたUNIX秒に換算してから蓄積する。
 */
export interface BatteryPoint {
  /** UNIX秒（保存済みのものは常に絶対時刻） */
  timestamp: number;
  /** 0〜100 */
  batteryLevel: number;
}

const STORAGE_KEY = "dya-studio-battery-history";
const MAX_POINTS_PER_SOURCE = 5000;
/** これを下回る値はUNIX時刻としてあり得ない（=起動からの秒数） */
export const MIN_EPOCH_SECONDS = 1_000_000_000;

/** deviceKey -> sourceId -> points */
type PersistedShape = Record<string, Record<string, BatteryPoint[]>>;

function readAll(storage: Storage): PersistedShape {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed as PersistedShape;
  } catch {
    return {};
  }
}

function writeAll(storage: Storage, data: PersistedShape): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // クォータ超過などは無視（履歴はあくまで補助的な情報）。
  }
}

/**
 * 起動からの秒数で記録された履歴を、取得時刻を基準に絶対時刻に換算する。
 * すでに絶対時刻（ファームの時刻同期済み）ならそのまま返す。
 */
export function toAbsoluteTimestamps(
  entries: readonly BatteryPoint[],
  nowSeconds: number,
): BatteryPoint[] {
  if (entries.length === 0) return [];
  const maxTimestamp = entries.reduce(
    (max, entry) => Math.max(max, entry.timestamp),
    Number.NEGATIVE_INFINITY,
  );
  if (maxTimestamp >= MIN_EPOCH_SECONDS) {
    return entries.map((entry) => ({
      timestamp: entry.timestamp,
      batteryLevel: entry.batteryLevel,
    }));
  }
  return entries.map((entry) => ({
    timestamp: Math.round(nowSeconds - (maxTimestamp - entry.timestamp)),
    batteryLevel: entry.batteryLevel,
  }));
}

/** 同じ秒の重複を除き、古い順に並べて上限件数で打ち切る。 */
export function mergePoints(
  existing: readonly BatteryPoint[],
  incoming: readonly BatteryPoint[],
): BatteryPoint[] {
  const byTimestamp = new Map<number, BatteryPoint>();
  for (const point of existing) {
    if (Number.isFinite(point?.timestamp)) byTimestamp.set(point.timestamp, point);
  }
  for (const point of incoming) {
    if (Number.isFinite(point?.timestamp)) byTimestamp.set(point.timestamp, point);
  }
  const merged = [...byTimestamp.values()].sort(
    (a, b) => a.timestamp - b.timestamp,
  );
  return merged.length > MAX_POINTS_PER_SOURCE
    ? merged.slice(merged.length - MAX_POINTS_PER_SOURCE)
    : merged;
}

export function loadBatteryHistory(
  storage: Storage,
  deviceKey: string,
): Record<number, BatteryPoint[]> {
  const perDevice = readAll(storage)[deviceKey] ?? {};
  const result: Record<number, BatteryPoint[]> = {};
  for (const [sourceId, points] of Object.entries(perDevice)) {
    if (!Array.isArray(points)) continue;
    result[Number(sourceId)] = mergePoints(points, []);
  }
  return result;
}

/** 既存の蓄積とマージして保存し、マージ後の配列を返す。 */
export function saveBatteryHistory(
  storage: Storage,
  deviceKey: string,
  sourceId: number,
  points: readonly BatteryPoint[],
): BatteryPoint[] {
  const all = readAll(storage);
  const perDevice = all[deviceKey] ?? {};
  const merged = mergePoints(perDevice[String(sourceId)] ?? [], points);
  all[deviceKey] = { ...perDevice, [String(sourceId)]: merged };
  writeAll(storage, all);
  return merged;
}

export function clearBatteryHistory(storage: Storage, deviceKey: string): void {
  const all = readAll(storage);
  delete all[deviceKey];
  writeAll(storage, all);
}
