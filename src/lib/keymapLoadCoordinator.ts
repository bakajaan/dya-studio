/**
 * Cross-consumer coordination for keymap-data loads.
 *
 * WHY THIS EXISTS
 * ---------------
 * `useKeymap()` is a plain hook, not a context, so every page that calls it owns
 * an independent copy of the state — and an independent loader. Two pages do:
 * {@link KeymapPage} (the editor) and {@link InsightsPage} (heatmap, cheat sheet
 * and dtsi export). While tabs were torn down on navigation only one of them
 * existed at a time; now that visited tabs stay mounted (so leaving a tab no
 * longer loses its state or its input-stream teardown), opening Insights while
 * the keymap tab is mounted starts a SECOND full keymap load over BLE at the
 * same time as the first.
 *
 * Two concurrent load pipelines over a slow BLE link is what the user saw as:
 * the Insights heatmap never appearing, the export section reporting "failed to
 * load the keymap", and then every later call failing with "GATT Server is
 * disconnected" while the keyboard itself kept typing perfectly fine (the
 * firmware was healthy — the browser's GATT session was the casualty).
 *
 * 日本語: タブを常駐させた副作用で、Insights と Keymap の両方が同時に
 * キーマップ全体を取りに行くようになってしまった。ここでロードを
 * 1本にまとめ、結果を全コンシューマーに配る。
 *
 * WHAT IT DOES
 * ------------
 * - {@link shareKeymapLoad}: single-flight. The first caller runs the load; any
 *   caller that arrives while it is still running gets the same result instead
 *   of issuing its own round-trips.
 * - {@link shareBackgroundLoad} + {@link addKeymapLoadListeners}: the fast path's
 *   deferred work (remaining layers / behavior labels) also runs once, and its
 *   results fan out to every consumer that registered for this load.
 *
 * Each consumer receives its OWN deep copy (see {@link cloneKeymapData}), so one
 * page's edit state can never bleed into another's.
 */
import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type {
  BehaviorDefinition,
  KeymapData,
  OnBehaviorsLoadedCallback,
  OnLayersLoadedCallback,
} from "../hooks/useKeymapSource";

/** Deep copy via `structuredClone` when available, falling back to the original
 * value (older/edge runtimes) — the fallback is only reached in environments the
 * app doesn't target, and sharing is still correct there, just not isolated. */
function deepCopy<T>(value: T): T {
  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      return value;
    }
  }
  return value;
}

/**
 * Per-consumer copy of a loaded {@link KeymapData}. `behaviors` is rebuilt as a
 * fresh Map so consumers can't observe each other's mutations.
 */
export function cloneKeymapData(data: KeymapData): KeymapData {
  const behaviors = new Map<number, BehaviorDefinition>();
  for (const [id, behavior] of data.behaviors) {
    behaviors.set(id, deepCopy(behavior));
  }
  return {
    physicalLayouts: deepCopy(data.physicalLayouts),
    keymap: deepCopy(data.keymap),
    behaviors,
    source: data.source,
    pendingLayerIds: [...data.pendingLayerIds],
    behaviorsDeferred: data.behaviorsDeferred,
  };
}

/** The load currently in flight, if any. Keyed so a load for a different
 * device/protocol is never shared. */
let inFlight: { key: string; promise: Promise<KeymapData> } | null = null;

/** Consumers waiting for the fast path's deferred layers / behaviors. */
const layerListeners = new Set<OnLayersLoadedCallback>();
const behaviorListeners = new Set<OnBehaviorsLoadedCallback>();

/** True while the shared background (deferred) load is running. */
let backgroundRunning = false;

/**
 * Run `load` unless an equivalent load is already in flight, in which case wait
 * for that one. Every caller gets its own {@link cloneKeymapData} copy.
 *
 * @param key - Identifies what is being loaded (protocol + device); loads with
 *   different keys are never shared
 */
export async function shareKeymapLoad(
  key: string,
  load: () => Promise<KeymapData>,
): Promise<KeymapData> {
  const joined = inFlight && inFlight.key === key ? inFlight.promise : null;
  if (joined) {
    return cloneKeymapData(await joined);
  }

  const promise = load();
  const entry = { key, promise };
  inFlight = entry;
  try {
    return cloneKeymapData(await promise);
  } finally {
    if (inFlight === entry) inFlight = null;
  }
}

/**
 * Register a consumer's callbacks for the deferred results of the load it is
 * about to start or join. Safe to call with `undefined` (consumers that don't
 * care about the background phase).
 */
export function addKeymapLoadListeners(
  onLayersLoaded?: OnLayersLoadedCallback,
  onBehaviorsLoaded?: OnBehaviorsLoadedCallback,
): void {
  if (onLayersLoaded) layerListeners.add(onLayersLoaded);
  if (onBehaviorsLoaded) behaviorListeners.add(onBehaviorsLoaded);
}

/** Whether anyone is waiting for deferred results (i.e. whether running the
 * background phase is worth the round-trips at all). */
export function hasKeymapLoadListeners(): boolean {
  return layerListeners.size > 0 || behaviorListeners.size > 0;
}

/**
 * Run the fast path's deferred phase once, fanning its results out to every
 * registered consumer. A no-op while a previous background phase is still
 * running — whoever registered meanwhile is served by that run.
 *
 * `run` receives the two emitters; each hands a fresh copy to each listener.
 * Listeners are dropped once the run settles: a later load registers again.
 */
export function shareBackgroundLoad(
  run: (
    emitBehaviors: (behaviors: Map<number, BehaviorDefinition>) => void,
    emitLayers: (layers: Keymap["layers"]) => void,
  ) => Promise<void>,
): void {
  if (backgroundRunning) return;
  backgroundRunning = true;

  const emitBehaviors = (behaviors: Map<number, BehaviorDefinition>) => {
    for (const listener of behaviorListeners) {
      const copy = new Map<number, BehaviorDefinition>();
      for (const [id, behavior] of behaviors) copy.set(id, deepCopy(behavior));
      listener(copy);
    }
  };
  const emitLayers = (layers: Keymap["layers"]) => {
    for (const listener of layerListeners) {
      listener(deepCopy(layers));
    }
  };

  void run(emitBehaviors, emitLayers)
    .catch((err) => {
      console.error("Background keymap load failed:", err);
    })
    .finally(() => {
      backgroundRunning = false;
      layerListeners.clear();
      behaviorListeners.clear();
    });
}

/**
 * Forget all shared state. Called on disconnect so a reconnect never joins a
 * load that belonged to the previous session, and so stale consumer callbacks
 * are dropped.
 */
export function resetKeymapLoadCoordinator(): void {
  inFlight = null;
  layerListeners.clear();
  behaviorListeners.clear();
  backgroundRunning = false;
}
