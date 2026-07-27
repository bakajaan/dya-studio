/**
 * "If I use this new keymap, how would key-press frequency look?" prediction.
 *
 * The keyboard's own key-usage counters (see useKeyUsage) record two
 * independent aggregates:
 * - per (layer, position): how often each physical key position was pressed
 * - per keycode: how often each *keycode* (regardless of where it was bound)
 *   was pressed
 *
 * When the user reassigns keys, the per-position history no longer reflects
 * what the NEW layout would feel like — but the per-keycode history still
 * tells us "how often does the user press the letter A" independent of
 * where A currently lives. This module projects that per-keycode history
 * onto the CURRENT (possibly unsaved) keymap bindings, so editing a key
 * immediately previews an estimated heatmap for the new arrangement.
 *
 * This is inherently an approximation: behaviors like mod-tap/layer-tap only
 * have their tap keycode considered (matching the same param1 heuristic used
 * for the "Top keys" labeling elsewhere), and "all layers combined" sums each
 * layer's contribution per physical position, which assumes overall layer
 * usage stays roughly similar to before.
 */
import type { BehaviorBinding, Layer } from "../hooks/useKeymap";
import type { KeyUsageKeycodeStat } from "../hooks/useKeyUsage";
import { HID_USAGE_PAGE_KEYBOARD, createHidUsage } from "./keycodes";

/** Same numeric space as BehaviorBinding.param1 for simple key-press behaviors. */
export function normalizeDeviceKeycode(
  usagePage: number,
  keycode: number,
): number {
  return usagePage === HID_USAGE_PAGE_KEYBOARD || usagePage === 0
    ? keycode
    : createHidUsage(usagePage, keycode);
}

/** Aggregates the device's per-keycode history into a lookup keyed the same
 * way as `bindingUsageKeycode` below, so the two can be matched directly. */
export function buildKeycodeUsageMap(
  keycodes: readonly KeyUsageKeycodeStat[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const entry of keycodes) {
    const key = normalizeDeviceKeycode(entry.usagePage, entry.keycode);
    map.set(key, (map.get(key) ?? 0) + entry.count);
  }
  return map;
}

/**
 * Best-effort extraction of the keycode a binding would send, so it can be
 * matched against the device's per-keycode history. Returns undefined for
 * behaviors we can't confidently map (mirrors the heuristic already used to
 * label "Top keys" elsewhere: only param1 when it's set).
 */
export function bindingUsageKeycode(
  binding: BehaviorBinding | undefined,
): number | undefined {
  if (!binding) return undefined;
  const param1 = (binding as { param1?: unknown }).param1;
  if (typeof param1 !== "number" || param1 === 0) return undefined;
  return param1;
}

/** "all" = every layer's contribution summed per position. A number = only
 * that one layer's bindings (e.g. 0 for the default/base layer). */
export type PredictionScope = "all" | number;

/**
 * Predicted press count per physical key position, projecting the device's
 * historical per-keycode counts onto `layers`' CURRENT bindings.
 */
export function computePredictedCountsByPosition(
  layers: readonly Layer[],
  usageMap: Map<number, number>,
  scope: PredictionScope,
): Map<number, number> {
  const counts = new Map<number, number>();
  const targetLayers =
    scope === "all" ? layers : layers[scope] ? [layers[scope]] : [];
  for (const layer of targetLayers) {
    layer.bindings.forEach((binding, position) => {
      const keycode = bindingUsageKeycode(binding);
      if (keycode === undefined) return;
      const historical = usageMap.get(keycode) ?? 0;
      if (historical === 0) return;
      counts.set(position, (counts.get(position) ?? 0) + historical);
    });
  }
  return counts;
}

export function maxOfCounts(counts: Map<number, number>): number {
  let max = 0;
  counts.forEach((count) => {
    if (count > max) max = count;
  });
  return max;
}
