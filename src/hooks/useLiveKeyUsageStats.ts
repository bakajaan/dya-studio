import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getLiveKeyUsageStats,
  recordHighlightedKeysUpdate,
  resetLiveKeyUsageStats,
  subscribeLiveKeyUsage,
} from "../lib/liveKeyUsageStore";
import {
  layerShares,
  maxPositionCount,
  topPositions,
  type KeyUsageStats,
} from "../lib/keyUsageStats";

export interface UseLiveKeyUsageStatsReturn {
  stats: KeyUsageStats;
  maxCount: number;
  shares: Array<{ layerIndex: number; count: number; share: number }>;
  topKeys: Array<{ position: number; count: number }>;
  resetStats: () => void;
}

/**
 * Live (Studio-side) key usage heatmap, backed by the shared
 * liveKeyUsageStore. Pass the highlightedKeys/activeLayerIndex/isEnabled of
 * an EXISTING useInputStream() instance — don't create a second
 * useInputStream() just for this hook, since every instance opens its own
 * notification subscription and would show its own (possibly disabled,
 * always-empty) view of highlightedKeys.
 */
export function useLiveKeyUsageStats(
  highlightedKeys: ReadonlySet<number>,
  activeLayerIndex: number | null,
  isEnabled: boolean,
): UseLiveKeyUsageStatsReturn {
  const [stats, setStats] = useState<KeyUsageStats>(() =>
    getLiveKeyUsageStats(),
  );

  useEffect(() => {
    return subscribeLiveKeyUsage(() => setStats(getLiveKeyUsageStats()));
  }, []);

  useEffect(() => {
    if (!isEnabled) return;
    recordHighlightedKeysUpdate(highlightedKeys, activeLayerIndex);
  }, [highlightedKeys, activeLayerIndex, isEnabled]);

  const maxCount = useMemo(() => maxPositionCount(stats), [stats]);
  const shares = useMemo(() => layerShares(stats), [stats]);
  const topKeys = useMemo(() => topPositions(stats, 5), [stats]);
  const resetStats = useCallback(() => resetLiveKeyUsageStats(), []);

  return { stats, maxCount, shares, topKeys, resetStats };
}
