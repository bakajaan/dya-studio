/**
 * バッテリー履歴のローカル保存（localStorage）と、消費ペースの推定。
 *
 * キーボード本体のリングバッファは上限件数で古い値が消えていくため、
 * 取得した履歴をブラウザ側にも蓄積して長期のグラフ（充電で上がる/
 * 使って下がる推移）を見られるようにする。
 *
 * ファームウェアの timestamp は uint16 の「起動からの秒数」である。つまり
 * - 再起動すると 0 に戻る
 * - 約18.2時間 (65536秒) で桁溢れして 0 に戻る
 * ため、配列全体を一律にシフトすると時系列が壊れる（ペリフェラルは
 * スリープ/再起動が多く、特に壊れやすい）。
 *
 * そこで timestamp が「減少した箇所」をセッションの切れ目とみなして分割し、
 * 最新セッションの末尾を取得時刻に合わせて、そこから遡って各セッションを
 * 絶対時刻に並べ直す。こうするとセッション内の経過時間（=消費ペースの計算に
 * 必要な情報）が保たれる。
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
/** セッションとセッションの間に挟む想定の空白（秒） */
export const SESSION_GAP_SECONDS = 60;
/**
 * 同じ残量の点が短時間に重複した場合は同一とみなす（秒）。
 * 再取得のたびに取得時刻を基準に再換算されるため、わずかにずれた重複が
 * できてしまうのを吸収する。ファームの同一残量の記録間隔は分単位なので
 * 本物の記録を潰すことはない。
 */
export const DEDUPE_WINDOW_SECONDS = 150;

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

function sanitize(entries: readonly BatteryPoint[]): BatteryPoint[] {
  const result: BatteryPoint[] = [];
  for (const entry of entries) {
    if (!entry) continue;
    if (!Number.isFinite(entry.timestamp)) continue;
    if (!Number.isFinite(entry.batteryLevel)) continue;
    result.push({
      timestamp: entry.timestamp,
      batteryLevel: entry.batteryLevel,
    });
  }
  return result;
}

/**
 * timestamp が減少した箇所（再起動 or uint16 桁溢れ）でセッションに分割する。
 * 入力は古い順に並んでいる前提。
 */
export function splitSessions(
  entries: readonly BatteryPoint[],
): BatteryPoint[][] {
  const sessions: BatteryPoint[][] = [];
  let current: BatteryPoint[] = [];
  let previous: number | null = null;
  for (const entry of sanitize(entries)) {
    if (previous !== null && entry.timestamp < previous) {
      if (current.length > 0) sessions.push(current);
      current = [];
    }
    current.push(entry);
    previous = entry.timestamp;
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

/**
 * 起動からの秒数で記録された履歴を、取得時刻を基準に絶対時刻に換算する。
 * すでに絶対時刻（ファームの時刻同期済み）ならそのまま返す。
 */
export function toAbsoluteTimestamps(
  entries: readonly BatteryPoint[],
  nowSeconds: number,
): BatteryPoint[] {
  const clean = sanitize(entries);
  if (clean.length === 0) return [];

  const maxTimestamp = clean.reduce(
    (max, entry) => Math.max(max, entry.timestamp),
    Number.NEGATIVE_INFINITY,
  );
  if (maxTimestamp >= MIN_EPOCH_SECONDS) {
    return clean;
  }

  const sessions = splitSessions(clean);
  const result: BatteryPoint[] = [];
  // 最新セッションの末尾＝ちょうど今、として遡っていく。
  let anchorEnd = Math.round(nowSeconds);
  for (let index = sessions.length - 1; index >= 0; index -= 1) {
    const session = sessions[index];
    const lastTimestamp = session[session.length - 1].timestamp;
    const converted = session.map((entry) => ({
      timestamp: anchorEnd - (lastTimestamp - entry.timestamp),
      batteryLevel: entry.batteryLevel,
    }));
    result.unshift(...converted);
    anchorEnd = converted[0].timestamp - SESSION_GAP_SECONDS;
  }
  return result;
}

/**
 * 古い順に並べ、重複（同一秒 / 短時間内の同一残量）を除いて上限件数で打ち切る。
 */
export function mergePoints(
  existing: readonly BatteryPoint[],
  incoming: readonly BatteryPoint[],
): BatteryPoint[] {
  const all = [...sanitize(existing), ...sanitize(incoming)].sort(
    (a, b) => a.timestamp - b.timestamp || a.batteryLevel - b.batteryLevel,
  );

  const merged: BatteryPoint[] = [];
  for (const point of all) {
    const previous = merged[merged.length - 1];
    if (previous) {
      if (previous.timestamp === point.timestamp) continue;
      if (
        previous.batteryLevel === point.batteryLevel &&
        point.timestamp - previous.timestamp <= DEDUPE_WINDOW_SECONDS
      ) {
        continue;
      }
    }
    merged.push(point);
  }

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

/* ------------------------------------------------------------------ */
/* 消費ペースの推定                                                    */
/* ------------------------------------------------------------------ */

/** 充電とみなす残量の増加幅（%） */
export const CHARGE_RISE_THRESHOLD = 2;
/** これ以上間隔が空いたペアは、電源が切れていた可能性が高いので使わない（秒） */
export const MAX_PAIR_GAP_SECONDS = 6 * 60 * 60;

export type BatteryDrainReason =
  | "ok"
  | "not-enough-data"
  | "no-decline"
  | "charging";

export interface BatteryDrainEstimate {
  /** %/時。減っている場合は正の値。推定できない場合は null */
  drainRatePerHour: number | null;
  /** 残り時間（時）。推定できない場合は null */
  remainingHours: number | null;
  /** 充電された回数（残量が閾値以上増えた回数） */
  chargeSessions: number;
  /** 推定に使った時間の合計（時） */
  sampleHours: number;
  /** 推定に使ったペア数 */
  samplePairs: number;
  reason: BatteryDrainReason;
}

const EMPTY_ESTIMATE: BatteryDrainEstimate = {
  drainRatePerHour: null,
  remainingHours: null,
  chargeSessions: 0,
  sampleHours: 0,
  samplePairs: 0,
  reason: "not-enough-data",
};

interface DeclineAccumulator {
  drop: number;
  seconds: number;
  pairs: number;
}

function accumulateDecline(points: readonly BatteryPoint[]): DeclineAccumulator {
  let drop = 0;
  let seconds = 0;
  let pairs = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const dt = current.timestamp - previous.timestamp;
    if (dt <= 0 || dt > MAX_PAIR_GAP_SECONDS) continue;
    if (current.batteryLevel >= previous.batteryLevel) continue;
    drop += previous.batteryLevel - current.batteryLevel;
    seconds += dt;
    pairs += 1;
  }
  return { drop, seconds, pairs };
}

/**
 * バッテリーの消費ペースと残り時間を推定する。
 *
 * - 直近の充電より後のデータだけを使う（充電で上がった分を混ぜない）
 * - 間隔が異常に空いたペアや、時刻が逆行したペアは捨てる
 * - 直近の充電後のデータが足りなければ、履歴全体の減少ペアで代用する
 *
 * セントラル側だけでなくペリフェラル側でも値が出るように、
 * 「厳密に単調減少している区間」ではなく「減少しているペアの合計」で
 * 平均ペースを求めるのがポイント。
 */
export function estimateBatteryDrain(
  points: readonly BatteryPoint[],
): BatteryDrainEstimate {
  const sorted = sanitize(points).sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length < 2) return { ...EMPTY_ESTIMATE };

  let chargeSessions = 0;
  let lastChargeIndex = -1;
  for (let index = 1; index < sorted.length; index += 1) {
    const rise = sorted[index].batteryLevel - sorted[index - 1].batteryLevel;
    if (rise >= CHARGE_RISE_THRESHOLD) {
      chargeSessions += 1;
      lastChargeIndex = index;
    }
  }

  const current = sorted[sorted.length - 1].batteryLevel;

  // まずは直近の充電より後のデータで推定する。
  const recent =
    lastChargeIndex >= 0 ? sorted.slice(lastChargeIndex) : sorted;
  let accumulated = accumulateDecline(recent);

  // 充電直後などでデータが足りなければ、履歴全体で代用する。
  let usedFallback = false;
  if (accumulated.pairs === 0 && recent.length !== sorted.length) {
    accumulated = accumulateDecline(sorted);
    usedFallback = accumulated.pairs > 0;
  }

  if (accumulated.pairs === 0 || accumulated.seconds <= 0) {
    const isCharging =
      sorted.length >= 2 &&
      sorted[sorted.length - 1].batteryLevel >
        sorted[sorted.length - 2].batteryLevel;
    return {
      ...EMPTY_ESTIMATE,
      chargeSessions,
      reason: isCharging ? "charging" : "no-decline",
    };
  }

  const sampleHours = accumulated.seconds / 3600;
  const drainRatePerHour = accumulated.drop / sampleHours;
  const remainingHours =
    drainRatePerHour > 0 ? current / drainRatePerHour : null;

  return {
    drainRatePerHour,
    remainingHours,
    chargeSessions,
    sampleHours,
    samplePairs: accumulated.pairs,
    reason: usedFallback ? "ok" : "ok",
  };
}
