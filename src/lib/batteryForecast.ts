/**
 * バッテリー残量の放電トレンドと「あと何時間使えるか」の予測。
 *
 * batteryHistoryStore.estimateBatteryDrain() は履歴全体の平均ペースを返すが、
 * ここでは
 * - 充電で区切った「放電セグメント」に分ける
 * - 直近セグメントを最小二乗法で回帰し、傾き（%/時）と当てはまり度(R^2)を出す
 * - 指定しきい値（既定10%）に到達する時刻を予測する
 * - 日別の消費量を出してトレンドを可視化する
 * ことで、40mAh 運用でどこまで持つかを判断しやすくする。
 */
import type { BatteryPoint } from "./batteryHistoryStore";
import { CHARGE_RISE_THRESHOLD, MAX_PAIR_GAP_SECONDS } from "./batteryHistoryStore";

export interface DischargeSegment {
  /** UNIX秒 */
  startedAt: number;
  /** UNIX秒 */
  endedAt: number;
  startLevel: number;
  endLevel: number;
  /** %/時（減っていれば正の値） */
  ratePerHour: number;
  points: BatteryPoint[];
}

export type ForecastReason =
  | "ok"
  | "not-enough-data"
  | "charging"
  | "no-decline";

export interface BatteryForecast {
  /** %/時（減っていれば正の値）。推定できない場合は null */
  ratePerHour: number | null;
  /** 回帰の当てはまり度 0〜1。推定できない場合は null */
  rSquared: number | null;
  /** 直近の残量（%） */
  currentLevel: number | null;
  /** 0% までの残り時間 */
  hoursToEmpty: number | null;
  /** しきい値までの残り時間 */
  hoursToThreshold: number | null;
  /** しきい値到達時刻（UNIX秒） */
  thresholdAt: number | null;
  /** 0% 到達時刻（UNIX秒） */
  emptyAt: number | null;
  thresholdPercent: number;
  /** 推定に使ったセグメントの長さ（時） */
  sampleHours: number;
  samplePoints: number;
  reason: ForecastReason;
}

export interface DailyDrain {
  /** YYYY-MM-DD（ローカルタイム） */
  date: string;
  /** その日の合計減少量（%） */
  drop: number;
  /** その日の記録がある時間（時） */
  hours: number;
  /** %/時 */
  ratePerHour: number;
}

function sorted(points: readonly BatteryPoint[]): BatteryPoint[] {
  return points
    .filter(
      (point) =>
        point &&
        Number.isFinite(point.timestamp) &&
        Number.isFinite(point.batteryLevel),
    )
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
}

/** 充電（一定以上の上昇）で区切って放電セグメントに分割する。 */
export function splitDischargeSegments(
  points: readonly BatteryPoint[],
  options: { minPoints?: number } = {},
): DischargeSegment[] {
  const minPoints = options.minPoints ?? 2;
  const list = sorted(points);
  const segments: DischargeSegment[] = [];
  let current: BatteryPoint[] = [];

  const flush = (): void => {
    if (current.length < minPoints) {
      current = [];
      return;
    }
    const first = current[0];
    const last = current[current.length - 1];
    const hours = (last.timestamp - first.timestamp) / 3600;
    segments.push({
      startedAt: first.timestamp,
      endedAt: last.timestamp,
      startLevel: first.batteryLevel,
      endLevel: last.batteryLevel,
      ratePerHour:
        hours > 0 ? (first.batteryLevel - last.batteryLevel) / hours : 0,
      points: current,
    });
    current = [];
  };

  for (const point of list) {
    const previous = current[current.length - 1];
    if (previous) {
      const rise = point.batteryLevel - previous.batteryLevel;
      const gap = point.timestamp - previous.timestamp;
      if (rise >= CHARGE_RISE_THRESHOLD || gap > MAX_PAIR_GAP_SECONDS) {
        flush();
      }
    }
    current.push(point);
  }
  flush();

  return segments;
}

interface Regression {
  slopePerHour: number;
  intercept: number;
  rSquared: number;
}

/** 最小二乗法。x は「先頭からの経過時間（時）」。 */
export function linearRegression(
  points: readonly BatteryPoint[],
): Regression | null {
  if (points.length < 2) return null;
  const base = points[0].timestamp;
  const xs = points.map((point) => (point.timestamp - base) / 3600);
  const ys = points.map((point) => point.batteryLevel);
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;

  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let index = 0; index < n; index += 1) {
    const dx = xs[index] - meanX;
    const dy = ys[index] - meanY;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slopePerHour = sxy / sxx;
  const intercept = meanY - slopePerHour * meanX;
  const rSquared = syy === 0 ? 1 : Math.min(1, (sxy * sxy) / (sxx * syy));
  return { slopePerHour, intercept, rSquared };
}

/**
 * 直近の放電セグメントから残り時間を予測する。
 * 直近セグメントが短すぎる場合は、より長い直近のセグメントで代用する。
 */
export function forecastBattery(
  points: readonly BatteryPoint[],
  options: {
    nowSeconds?: number;
    thresholdPercent?: number;
    minSampleHours?: number;
  } = {},
): BatteryForecast {
  const thresholdPercent = options.thresholdPercent ?? 10;
  const minSampleHours = options.minSampleHours ?? 0.5;
  const list = sorted(points);
  const currentLevel =
    list.length > 0 ? list[list.length - 1].batteryLevel : null;
  const nowSeconds =
    options.nowSeconds ??
    (list.length > 0 ? list[list.length - 1].timestamp : 0);

  const empty: BatteryForecast = {
    ratePerHour: null,
    rSquared: null,
    currentLevel,
    hoursToEmpty: null,
    hoursToThreshold: null,
    thresholdAt: null,
    emptyAt: null,
    thresholdPercent,
    sampleHours: 0,
    samplePoints: 0,
    reason: "not-enough-data",
  };

  if (list.length < 2) return empty;

  const segments = splitDischargeSegments(list);
  if (segments.length === 0) return empty;

  const last = segments[segments.length - 1];
  const lastHours = (last.endedAt - last.startedAt) / 3600;
  const usable =
    lastHours >= minSampleHours
      ? last
      : ([...segments]
          .reverse()
          .find(
            (segment) =>
              (segment.endedAt - segment.startedAt) / 3600 >= minSampleHours,
          ) ?? last);

  const regression = linearRegression(usable.points);
  const sampleHours = (usable.endedAt - usable.startedAt) / 3600;
  if (!regression) {
    return { ...empty, sampleHours, samplePoints: usable.points.length };
  }

  const ratePerHour = -regression.slopePerHour;
  if (ratePerHour <= 0) {
    return {
      ...empty,
      ratePerHour: null,
      rSquared: regression.rSquared,
      sampleHours,
      samplePoints: usable.points.length,
      reason: ratePerHour < 0 ? "charging" : "no-decline",
    };
  }

  const level = currentLevel ?? usable.endLevel;
  const hoursToEmpty = level / ratePerHour;
  const hoursToThreshold = Math.max(0, (level - thresholdPercent) / ratePerHour);

  return {
    ratePerHour,
    rSquared: regression.rSquared,
    currentLevel: level,
    hoursToEmpty,
    hoursToThreshold,
    thresholdAt: Math.round(nowSeconds + hoursToThreshold * 3600),
    emptyAt: Math.round(nowSeconds + hoursToEmpty * 3600),
    thresholdPercent,
    sampleHours,
    samplePoints: usable.points.length,
    reason: "ok",
  };
}

function localDateKey(timestampSeconds: number): string {
  const date = new Date(timestampSeconds * 1000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** 日別の消費量（充電による上昇は無視）。グラフのトレンド表示用。 */
export function summarizeDailyDrain(
  points: readonly BatteryPoint[],
): DailyDrain[] {
  const list = sorted(points);
  const byDate = new Map<string, { drop: number; seconds: number }>();

  for (let index = 1; index < list.length; index += 1) {
    const previous = list[index - 1];
    const current = list[index];
    const delta = current.timestamp - previous.timestamp;
    if (delta <= 0 || delta > MAX_PAIR_GAP_SECONDS) continue;
    if (current.batteryLevel >= previous.batteryLevel) continue;
    const key = localDateKey(current.timestamp);
    const entry = byDate.get(key) ?? { drop: 0, seconds: 0 };
    entry.drop += previous.batteryLevel - current.batteryLevel;
    entry.seconds += delta;
    byDate.set(key, entry);
  }

  return [...byDate.entries()]
    .map(([date, entry]) => ({
      date,
      drop: entry.drop,
      hours: entry.seconds / 3600,
      ratePerHour: entry.seconds > 0 ? entry.drop / (entry.seconds / 3600) : 0,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** 「12時間30分」のような表示用テキスト。 */
export function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.round(hours * 60)}分`;
  const days = Math.floor(hours / 24);
  const restHours = Math.floor(hours % 24);
  const minutes = Math.round((hours - Math.floor(hours)) * 60);
  if (days > 0) return `${days}日${restHours}時間`;
  return minutes > 0 ? `${restHours}時間${minutes}分` : `${restHours}時間`;
}
