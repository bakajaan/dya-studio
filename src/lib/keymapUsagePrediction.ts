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
 * Figuring out "which keycode would this binding send" requires knowing the
 * BEHAVIOR, not just blindly reading param1: most behaviors don't carry a
 * keycode at all (layer switches, macros, mouse buttons, ...), and some
 * (mod-tap, layer-tap) carry the keycode in param2, not param1 — param1 there
 * is a modifier / layer number, which happens to collide numerically with
 * unrelated keyboard usage codes (e.g. a mouse "Middle Click" value can equal
 * a letter's HID code), causing bogus matches if read blindly. This module
 * uses the SAME behavior metadata registry (see behaviorMetadata.ts) that the
 * rest of the app already relies on to render binding labels, so the two stay
 * in sync automatically as behaviors are added there.
 *
 * This is inherently an approximation:
 * - Mod-tap / layer-tap only contribute their TAP keycode (param2) — the
 *   hold-side modifier/layer isn't counted, since it's not a "typed key".
 * - Non-keycode behaviors (mouse buttons, macros, layer switches, BT/output
 *   commands, ...) are skipped entirely; their historical counts (if any)
 *   don't carry over to the prediction.
 * - "All layers combined" sums each layer's contribution per physical
 *   position, which assumes overall layer usage stays roughly similar to
 *   before.
 */
import type { BehaviorBinding, BehaviorDefinition, Layer } from "../hooks/useKeymap";
import type { KeyUsageKeycodeStat } from "../hooks/useKeyUsage";
import { getBehaviorMetadata } from "./behaviorMetadata";
import {
  HID_USAGE_PAGE_KEYBOARD,
  createHidUsage,
  dropModifierFlags,
  getHidUsageCode,
  getHidUsagePage,
} from "./keycodes";

/** Same numeric space as the device's per-keycode stats: bare keyboard-page
 * codes are kept as-is (matching how the firmware reports them), anything on
 * another HID usage page (consumer, ...) is merged into a single page+code
 * value so it can be used as a Map key alongside keyboard-page codes. */
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
 * Extracts the keycode a binding would actually SEND, using the same
 * behavior metadata registry the rest of the app uses to label bindings (see
 * behaviorMetadata.ts), so this stays correct as behaviors are added there:
 * - Behaviors whose param2 is a keycode (mod-tap, layer-tap) use param2 —
 *   that's the TAP keycode, i.e. what typing that key actually sends.
 * - Behaviors whose param1 is a keycode (key press, key toggle, sticky key,
 *   ...) use param1.
 * - Everything else (layer switches, macros, mouse buttons, BT/output
 *   commands, ...) returns undefined: there is no single keycode to
 *   attribute historical presses to.
 * The returned value is normalized into the SAME numeric space as
 * `normalizeDeviceKeycode`, so it can be looked up directly in a map built by
 * `buildKeycodeUsageMap`.
 */
export function bindingUsageKeycode(
  binding: BehaviorBinding | undefined,
  behaviors: Map<number, BehaviorDefinition>,
): number | undefined {
  if (!binding) return undefined;
  const behavior = behaviors.get(binding.behaviorId);
  if (!behavior) return undefined;
  const metadata = getBehaviorMetadata(behavior.displayName);
  if (!metadata) return undefined;

  const rawHidUsage =
    metadata.param2Type === "keycode"
      ? binding.param2
      : metadata.param1Type === "keycode"
        ? binding.param1
        : undefined;
  if (rawHidUsage === undefined || rawHidUsage === 0) return undefined;

  const withoutModifiers = dropModifierFlags(rawHidUsage);
  const usagePage = getHidUsagePage(withoutModifiers);
  const keycode = getHidUsageCode(withoutModifiers);
  return normalizeDeviceKeycode(usagePage, keycode);
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
  behaviors: Map<number, BehaviorDefinition>,
  usageMap: Map<number, number>,
  scope: PredictionScope,
): Map<number, number> {
  const counts = new Map<number, number>();
  const targetLayers =
    scope === "all" ? layers : layers[scope] ? [layers[scope]] : [];
  for (const layer of targetLayers) {
    layer.bindings.forEach((binding, position) => {
      const keycode = bindingUsageKeycode(binding, behaviors);
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
