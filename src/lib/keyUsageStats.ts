/**
 * Key usage statistics (heatmap / layer usage) collected from the
 * zmk__input_stream subsystem. Pure data logic so it can be unit tested;
 * persistence goes through an injected Storage-like object.
 */

export interface KeyUsageStats {
  version: 1;
  startedAt: string;
  totalPresses: number;
  /** key: key position (stringified number) -> press count */
  countsByPosition: Record<string, number>;
  /** key: layer index (stringified number) -> press count */
  countsByLayer: Record<string, number>;
}

export const KEY_USAGE_STORAGE_KEY = "dya-studio-key-usage-stats";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function createEmptyStats(now: Date = new Date()): KeyUsageStats {
  return {
    version: 1,
    startedAt: now.toISOString(),
    totalPresses: 0,
    countsByPosition: {},
    countsByLayer: {},
  };
}

export function recordKeyPress(
  stats: KeyUsageStats,
  position: number,
  layerIndex: number,
): KeyUsageStats {
  const positionKey = String(position);
  const layerKey = String(layerIndex);
  return {
    ...stats,
    totalPresses: stats.totalPresses + 1,
    countsByPosition: {
      ...stats.countsByPosition,
      [positionKey]: (stats.countsByPosition[positionKey] ?? 0) + 1,
    },
    countsByLayer: {
      ...stats.countsByLayer,
      [layerKey]: (stats.countsByLayer[layerKey] ?? 0) + 1,
    },
  };
}

export function maxPositionCount(stats: KeyUsageStats): number {
  let max = 0;
  for (const count of Object.values(stats.countsByPosition)) {
    if (count > max) max = count;
  }
  return max;
}

/** 0 (unused) .. 1 (hottest). */
export function heatLevel(count: number, maxCount: number): number {
  if (maxCount <= 0 || count <= 0) return 0;
  return Math.min(1, count / maxCount);
}

/** Cold blue -> hot red, for SVG/CSS fills. */
export function heatColor(level: number): string {
  if (level <= 0) return "rgba(128, 128, 128, 0.12)";
  const clamped = Math.min(1, level);
  const hue = Math.round(210 - 210 * clamped);
  const alpha = (0.25 + 0.6 * clamped).toFixed(2);
  return `hsla(${hue}, 90%, 55%, ${alpha})`;
}

export function topPositions(
  stats: KeyUsageStats,
  limit: number,
): Array<{ position: number; count: number }> {
  return Object.entries(stats.countsByPosition)
    .map(([position, count]) => ({ position: Number(position), count }))
    .sort((a, b) => b.count - a.count || a.position - b.position)
    .slice(0, limit);
}

export function layerShares(
  stats: KeyUsageStats,
): Array<{ layerIndex: number; count: number; share: number }> {
  return Object.entries(stats.countsByLayer)
    .map(([layerIndex, count]) => ({
      layerIndex: Number(layerIndex),
      count,
      share: stats.totalPresses > 0 ? count / stats.totalPresses : 0,
    }))
    .sort((a, b) => b.count - a.count || a.layerIndex - b.layerIndex);
}

export function loadStats(storage: StorageLike): KeyUsageStats {
  try {
    const raw = storage.getItem(KEY_USAGE_STORAGE_KEY);
    if (!raw) return createEmptyStats();
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return createEmptyStats();
    }
    const candidate = parsed as Partial<KeyUsageStats>;
    return {
      version: 1,
      startedAt:
        typeof candidate.startedAt === "string"
          ? candidate.startedAt
          : new Date().toISOString(),
      totalPresses:
        typeof candidate.totalPresses === "number" ? candidate.totalPresses : 0,
      countsByPosition: candidate.countsByPosition ?? {},
      countsByLayer: candidate.countsByLayer ?? {},
    };
  } catch {
    return createEmptyStats();
  }
}

export function saveStats(storage: StorageLike, stats: KeyUsageStats): void {
  try {
    storage.setItem(KEY_USAGE_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Storage quota/privacy errors are non-fatal: stats just stop persisting.
  }
}

export function clearStats(storage: StorageLike): KeyUsageStats {
  try {
    storage.removeItem(KEY_USAGE_STORAGE_KEY);
  } catch {
    // ignore
  }
  return createEmptyStats();
}
