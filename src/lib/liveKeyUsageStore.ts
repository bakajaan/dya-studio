/**
 * Centralized, singleton store for the "live" (Studio-side) key usage
 * heatmap statistics collected from zmk__input_stream notifications.
 *
 * This used to be private state inside InsightsPage. The Keymap tab's own
 * insights panel now wants to show the same live heatmap next to the
 * editor, and both tabs stay mounted at the same time (see TabNavigation) —
 * each keeps its own useInputStream() subscription. If each page recorded
 * presses into its own local state independently, two "record a press"
 * effects could both apply the same physical keypress to their own copy of
 * the counters and corrupt the numbers. So recording is centralized here:
 * callers report their locally-observed highlightedKeys/layer via
 * recordHighlightedKeysUpdate(), and this module deduplicates by content
 * (not by which caller reported it) before mutating the single shared
 * KeyUsageStats and persisting it to localStorage.
 */
import {
  clearStats,
  loadStats,
  recordKeyPress,
  saveStats,
  type KeyUsageStats,
} from "./keyUsageStats";

let stats: KeyUsageStats | null = null;
let prevHighlightedKeys: ReadonlySet<number> = new Set();
const listeners = new Set<() => void>();

function ensureStats(): KeyUsageStats {
  if (stats === null) {
    stats = loadStats(window.localStorage);
  }
  return stats;
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeLiveKeyUsage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLiveKeyUsageStats(): KeyUsageStats {
  return ensureStats();
}

/**
 * Reports the caller's current highlightedKeys/activeLayerIndex snapshot.
 * Only positions not present in the previously reported snapshot are
 * counted as new presses, so calling this repeatedly with the same
 * (content-equal) set from multiple mounted consumers is a safe no-op.
 */
export function recordHighlightedKeysUpdate(
  highlightedKeys: ReadonlySet<number>,
  activeLayerIndex: number | null,
): void {
  const previous = prevHighlightedKeys;
  const pressed: number[] = [];
  highlightedKeys.forEach((position) => {
    if (!previous.has(position)) pressed.push(position);
  });
  prevHighlightedKeys = new Set(highlightedKeys);
  if (pressed.length === 0) return;

  const layerIndex = activeLayerIndex ?? 0;
  let next = ensureStats();
  for (const position of pressed) {
    next = recordKeyPress(next, position, layerIndex);
  }
  stats = next;
  saveStats(window.localStorage, next);
  notify();
}

export function resetLiveKeyUsageStats(): void {
  stats = clearStats(window.localStorage);
  prevHighlightedKeys = new Set();
  notify();
}
