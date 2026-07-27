/**
 * "If I use this new keymap, how would key-press frequency look?" prediction.
 *
 * The keyboard's own key-usage counters (see useKeyUsage) record two
 * independent aggregates:
 * - per (layer, position): how often each physical key position was pressed
 * - per keycode: how often each *keycode* (regardless of where it was bound)
 *   was pressed
 *
 * 【2026-07-27 追記 / 予測がデバイス実測と一致しない件】
 * The first implementation projected ONLY the per-keycode history onto the
 * current bindings (see the legacy computePredictedCountsByPosition below).
 * That threw away all position information, so the prediction never matched
 * the "On device" heatmap even when the keymap was completely untouched:
 * - the full global count of a keycode was written to EVERY position bound to
 *   it, so a key that exists on several layers got the same number everywhere
 *   (even on a layer that is barely used),
 * - bindings that send no keycode (layer taps, layer switches, macros, mouse
 *   buttons, ...) contributed nothing at all, even though the device has real
 *   counts for those positions,
 * - the per-keycode total doesn't even equal the per-position total (combos /
 *   macros emit keycodes without a matching single key press), so the two
 *   grand totals could never line up.
 *
 * computePredictedUsage below fixes that by REDISTRIBUTING the device's
 * per-(layer, position) history instead:
 * - Every position's history is attributed to the binding that was there when
 *   the keymap was loaded (`originalBindings`, i.e. the last saved keymap).
 * - Each position in the edited keymap then inherits the history of the
 *   binding that now sits there: a position whose binding is unchanged keeps
 *   its OWN count, so an untouched keymap reproduces the "On device" heatmap
 *   exactly — including layer taps, macros and other non-keycode bindings.
 * - A binding that moved carries its count to its new position(s) (split
 *   evenly when it now appears in several places, so the total is conserved).
 * - A binding that is brand new falls back to keycode-level matching: the
 *   history released by whatever used to send that keycode, and finally the
 *   device's global per-keycode counter when the keycode was never bound
 *   anywhere before (that covers keycodes only produced by combos/macros).
 * - History whose binding disappeared from the keymap is reported as
 *   `unassigned` rather than silently spread around.
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
 */
import type {
  BehaviorBinding,
  BehaviorDefinition,
  Layer,
} from "../hooks/useKeymap";
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

/**
 * Identity of a binding, used to follow "the same binding" from the last saved
 * keymap to the edited one. A binding is the same only when behavior AND both
 * parameters match, so `&mt LCTRL A` and `&kp A` are correctly treated as
 * different bindings (the keycode-level fallback still relates them).
 */
export function bindingSignature(
  binding: BehaviorBinding | undefined,
): string | undefined {
  if (!binding) return undefined;
  return `${binding.behaviorId}/${binding.param1}/${binding.param2}`;
}

/** "all" = every layer's contribution summed per position. A number = only
 * that one layer's bindings (e.g. 0 for the default/base layer). */
export type PredictionScope = "all" | number;

export function maxOfCounts(counts: Map<number, number>): number {
  let max = 0;
  counts.forEach((count) => {
    if (count > max) max = count;
  });
  return max;
}

/**
 * LEGACY per-keycode projection, kept as the fallback used when the device's
 * per-(layer, position) history isn't available (only per-keycode counters
 * were read). See the module doc for why this can't match the device heatmap:
 * it assigns each keycode's whole global count to every position bound to it.
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

/** One entry of the device's per-(layer, position) history. Structurally
 * compatible with useKeyUsage's position stats; `layer` is the layer INDEX as
 * reported by the firmware (i.e. the index into `layers`). */
export type PositionUsageStat = {
  layer: number;
  position: number;
  count: number;
};

export type PredictedUsage = {
  /** Predicted presses per physical key position (summed over the layers in
   * scope, exactly like the "On device" heatmap does). */
  countsByPosition: Map<number, number>;
  maxCount: number;
  total: number;
  /** Presses whose binding no longer exists anywhere in the keymap, so they
   * can't be carried over to any position. */
  unassigned: number;
  /** Positions whose number is an estimate (the binding there is new or moved,
   * so its count was inherited/split rather than measured at that position). */
  estimatedPositions: Set<number>;
  /** False when only per-keycode counters were available and the rough legacy
   * projection had to be used instead of position-history redistribution. */
  hasPositionHistory: boolean;
  /** True when every position in scope kept its own measured history, i.e. the
   * prediction is identical to the device's own numbers. */
  matchesDevice: boolean;
};

function slotKey(layerIndex: number, position: number): string {
  return `${layerIndex}:${position}`;
}

/**
 * Predicted press count per physical key position for the CURRENT (possibly
 * unsaved) keymap, by redistributing the device's per-(layer, position)
 * history according to how bindings moved. See the module doc.
 */
export function computePredictedUsage({
  layers,
  behaviors,
  originalBindings,
  devicePositions,
  keycodeUsage,
  scope,
}: {
  layers: readonly Layer[];
  behaviors: Map<number, BehaviorDefinition>;
  /** Last-saved bindings keyed `layerId:position` (useKeymap.originalBindings). */
  originalBindings: Map<string, BehaviorBinding>;
  devicePositions: readonly PositionUsageStat[];
  keycodeUsage: Map<number, number>;
  scope: PredictionScope;
}): PredictedUsage {
  // --- Device history, keyed by layer index + position ---------------------
  const historyCount = new Map<string, number>();
  for (const entry of devicePositions) {
    const key = slotKey(entry.layer, entry.position);
    historyCount.set(key, (historyCount.get(key) ?? 0) + entry.count);
  }

  // No per-position history (only keycode counters were read): fall back to
  // the rough legacy projection so the tab still shows something.
  if (historyCount.size === 0) {
    const counts = computePredictedCountsByPosition(
      layers,
      behaviors,
      keycodeUsage,
      scope,
    );
    let total = 0;
    counts.forEach((count) => {
      total += count;
    });
    return {
      countsByPosition: counts,
      maxCount: maxOfCounts(counts),
      total,
      unassigned: 0,
      estimatedPositions: new Set(counts.keys()),
      hasPositionHistory: false,
      matchesDevice: false,
    };
  }

  // --- Where each binding WAS (last saved) and IS (edited) -----------------
  // Both maps cover every layer, not just the ones in scope: a binding that
  // still lives on an out-of-scope layer must not look "released".
  const originalSigAt = new Map<string, string>();
  const originalKeycodeAt = new Map<string, number>();
  const currentSigAt = new Map<string, string>();
  const sourcesBySig = new Map<string, string[]>();

  layers.forEach((layer, layerIndex) => {
    layer.bindings.forEach((binding, position) => {
      const key = slotKey(layerIndex, position);
      const currentSig = bindingSignature(binding);
      if (currentSig) currentSigAt.set(key, currentSig);

      const original =
        originalBindings.get(`${layer.id}:${position}`) ?? binding;
      const originalSig = bindingSignature(original);
      if (!originalSig) return;
      originalSigAt.set(key, originalSig);
      const originalKeycode = bindingUsageKeycode(original, behaviors);
      if (originalKeycode !== undefined) {
        originalKeycodeAt.set(key, originalKeycode);
      }
      const sources = sourcesBySig.get(originalSig) ?? [];
      sources.push(key);
      sourcesBySig.set(originalSig, sources);
    });
  });

  // History held by positions whose binding actually changed — this is the
  // only history that may travel to another position.
  const releasedCount = new Map<string, number>();
  let releasedTotal = 0;
  originalSigAt.forEach((originalSig, key) => {
    if (currentSigAt.get(key) === originalSig) return;
    const count = historyCount.get(key) ?? 0;
    releasedCount.set(key, count);
    releasedTotal += count;
  });

  // --- Targets: the positions we are predicting for ------------------------
  const targetLayerIndexes =
    scope === "all"
      ? layers.map((_, index) => index)
      : layers[scope]
        ? [scope]
        : [];
  const targetsBySig = new Map<string, string[]>();
  const targetKeycodeAt = new Map<string, number>();
  for (const layerIndex of targetLayerIndexes) {
    const layer = layers[layerIndex];
    if (!layer) continue;
    layer.bindings.forEach((binding, position) => {
      const key = slotKey(layerIndex, position);
      const sig = bindingSignature(binding);
      if (!sig) return;
      const targets = targetsBySig.get(sig) ?? [];
      targets.push(key);
      targetsBySig.set(sig, targets);
      const keycode = bindingUsageKeycode(binding, behaviors);
      if (keycode !== undefined) targetKeycodeAt.set(key, keycode);
    });
  }

  // --- Phase 1: exact binding matching -----------------------------------
  const filled = new Map<string, number>();
  const estimatedSlots = new Set<string>();
  const consumedReleased = new Set<string>();
  const inheritedTargets: string[] = [];
  let distributedFromReleased = 0;

  targetsBySig.forEach((targets, sig) => {
    const sources = sourcesBySig.get(sig) ?? [];
    const sourceKeys = new Set(sources);
    const pending: string[] = [];

    for (const key of targets) {
      if (sourceKeys.has(key) && !releasedCount.has(key)) {
        // This position still holds the binding it was measured with: keep its
        // own number. This is what makes an untouched keymap match the device.
        filled.set(key, historyCount.get(key) ?? 0);
      } else {
        pending.push(key);
      }
    }
    if (pending.length === 0) return;

    // The binding moved here from somewhere else: take the history those
    // positions released and split it evenly, so the total is conserved.
    let leftover = 0;
    for (const key of sources) {
      if (!releasedCount.has(key) || consumedReleased.has(key)) continue;
      leftover += releasedCount.get(key) ?? 0;
      consumedReleased.add(key);
    }
    distributedFromReleased += leftover;
    const share = leftover / pending.length;
    for (const key of pending) {
      filled.set(key, share);
      estimatedSlots.add(key);
      if (share === 0) inheritedTargets.push(key);
    }
  });

  // --- Phase 2: keycode-level fallback for brand-new bindings -------------
  // Nothing sent this exact binding before, so fall back to "how often does
  // this keycode get typed": first the history released by whatever used to
  // send it, then the device's global per-keycode counter (which also covers
  // keycodes only produced by combos/macros, i.e. never bound to a position).
  if (inheritedTargets.length > 0) {
    const remainingKeysByKeycode = new Map<number, string[]>();
    const remainingByKeycode = new Map<number, number>();
    releasedCount.forEach((count, key) => {
      if (consumedReleased.has(key)) return;
      const keycode = originalKeycodeAt.get(key);
      if (keycode === undefined) return;
      remainingByKeycode.set(keycode, (remainingByKeycode.get(keycode) ?? 0) + count);
      const keys = remainingKeysByKeycode.get(keycode) ?? [];
      keys.push(key);
      remainingKeysByKeycode.set(keycode, keys);
    });

    const pendingByKeycode = new Map<number, string[]>();
    for (const key of inheritedTargets) {
      const keycode = targetKeycodeAt.get(key);
      if (keycode === undefined) continue;
      const keys = pendingByKeycode.get(keycode) ?? [];
      keys.push(key);
      pendingByKeycode.set(keycode, keys);
    }

    pendingByKeycode.forEach((keys, keycode) => {
      let pool = remainingByKeycode.get(keycode) ?? 0;
      if (pool > 0) {
        for (const sourceKey of remainingKeysByKeycode.get(keycode) ?? []) {
          consumedReleased.add(sourceKey);
        }
        distributedFromReleased += pool;
      } else {
        pool = keycodeUsage.get(keycode) ?? 0;
      }
      if (pool === 0) return;
      const share = pool / keys.length;
      for (const key of keys) {
        filled.set(key, share);
        estimatedSlots.add(key);
      }
    });
  }

  // --- Aggregate per physical position ------------------------------------
  const countsByPosition = new Map<number, number>();
  filled.forEach((count, key) => {
    const position = Number(key.slice(key.indexOf(":") + 1));
    countsByPosition.set(position, (countsByPosition.get(position) ?? 0) + count);
  });
  const estimatedPositions = new Set<number>();
  estimatedSlots.forEach((key) => {
    estimatedPositions.add(Number(key.slice(key.indexOf(":") + 1)));
  });

  let total = 0;
  countsByPosition.forEach((count, position) => {
    const rounded = Math.round(count);
    countsByPosition.set(position, rounded);
    total += rounded;
  });

  return {
    countsByPosition,
    maxCount: maxOfCounts(countsByPosition),
    total,
    unassigned: Math.max(0, Math.round(releasedTotal - distributedFromReleased)),
    estimatedPositions,
    hasPositionHistory: true,
    matchesDevice: estimatedSlots.size === 0 && releasedTotal === 0,
  };
}
