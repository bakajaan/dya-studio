/**
 * Keymap profile export/import.
 *
 * A profile is a device-independent snapshot of the full keymap: every
 * layer's bindings are stored with the behavior's DISPLAY NAME instead of its
 * device-local behavior id, so a profile saved from one keyboard can be
 * applied to another keyboard whose firmware assigns different behavior ids.
 *
 * Profiles are persisted to localStorage and can also be exported/imported as
 * JSON files. When the source and target keyboards have a different key count
 * (e.g. the 40-key jisaku_1 vs the 34-key aerogu34), key positions are
 * converted via {@link mapPosition}.
 */
import type {
  BehaviorBinding,
  Keymap,
} from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { BehaviorDefinition } from "../hooks/useKeymapSource";

export interface ProfileBinding {
  /** Behavior display name on the source device (portable identifier). */
  behavior: string;
  /** Behavior id on the source device (informational only). */
  behaviorId: number;
  param1: number;
  param2: number;
}

export interface ProfileLayer {
  name: string;
  bindings: ProfileBinding[];
}

export interface KeymapProfile {
  version: 1;
  name: string;
  createdAt: string;
  deviceName?: string;
  keyCount: number;
  layers: ProfileLayer[];
}

const STORAGE_KEY = "dya-studio-keymap-profiles";

/** Runtime validation for profiles read from localStorage or a JSON file. */
export function isKeymapProfile(value: unknown): value is KeymapProfile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (typeof v.name !== "string" || typeof v.keyCount !== "number") {
    return false;
  }
  if (!Array.isArray(v.layers)) return false;
  return (v.layers as unknown[]).every((layer) => {
    if (typeof layer !== "object" || layer === null) return false;
    const l = layer as Record<string, unknown>;
    if (typeof l.name !== "string" || !Array.isArray(l.bindings)) return false;
    return (l.bindings as unknown[]).every((binding) => {
      if (typeof binding !== "object" || binding === null) return false;
      const b = binding as Record<string, unknown>;
      return (
        typeof b.behavior === "string" &&
        typeof b.param1 === "number" &&
        typeof b.param2 === "number"
      );
    });
  });
}

/** Parse a profile JSON string, returning null when it is not a profile. */
export function parseProfileJson(text: string): KeymapProfile | null {
  try {
    const parsed: unknown = JSON.parse(text);
    return isKeymapProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/** Load every saved profile from localStorage (invalid entries dropped). */
export function listProfiles(): KeymapProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isKeymapProfile);
  } catch {
    return [];
  }
}

/** Insert or replace a profile (matched by name) and return the new list. */
export function upsertProfile(profile: KeymapProfile): KeymapProfile[] {
  const next = listProfiles().filter((p) => p.name !== profile.name);
  next.unshift(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Delete a profile by name and return the new list. */
export function removeProfile(name: string): KeymapProfile[] {
  const next = listProfiles().filter((p) => p.name !== name);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/** Snapshot the loaded keymap as a device-independent profile. */
export function serializeKeymap(
  keymap: Keymap,
  behaviors: Map<number, BehaviorDefinition>,
  name: string,
  deviceName?: string,
): KeymapProfile {
  return {
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    deviceName,
    keyCount: keymap.layers[0]?.bindings.length ?? 0,
    layers: keymap.layers.map((layer) => ({
      name: layer.name,
      bindings: layer.bindings.map((binding) => ({
        behavior:
          behaviors.get(binding.behaviorId)?.displayName ??
          `#${binding.behaviorId}`,
        behaviorId: binding.behaviorId,
        param1: binding.param1,
        param2: binding.param2,
      })),
    })),
  };
}

/**
 * Convert a key position between keyboards with different key counts.
 *
 * Known mapping: the 40-key jisaku_1 and the 34-key aerogu34 share the same
 * logical 34-key layout. On the 40-key board, positions 0-29 are identical,
 * positions 33-36 are the four thumb keys (= 34-key positions 30-33), and
 * positions 30-32 / 37-39 are the intentionally blank bottom outer keys that
 * have no 34-key counterpart.
 *
 * Returns null when the position has no counterpart on the target keyboard.
 */
export function mapPosition(
  from: number,
  fromCount: number,
  toCount: number,
): number | null {
  if (fromCount === toCount) return from;
  if (fromCount === 40 && toCount === 34) {
    if (from <= 29) return from;
    if (from >= 33 && from <= 36) return from - 3;
    return null;
  }
  if (fromCount === 34 && toCount === 40) {
    if (from <= 29) return from;
    if (from >= 30 && from <= 33) return from + 3;
    return null;
  }
  // Unknown pair of key counts: keep the index when it fits, drop otherwise.
  return from < toCount ? from : null;
}

export interface ApplyPlanEntry {
  layerId: number;
  keyPosition: number;
  binding: BehaviorBinding;
}

export interface ApplyPlan {
  /** Bindings to write (positions already converted, ids already resolved). */
  entries: ApplyPlanEntry[];
  /** Behavior names in the profile that the target keyboard does not have. */
  skippedBehaviors: string[];
  /** Source positions with no counterpart position on the target keyboard. */
  skippedPositions: number;
  /** True when the profile and the target have a different layer count. */
  layerCountMismatch: boolean;
}

/**
 * Build the list of bindings to write so the target keyboard matches the
 * profile. Layers are matched by order (index), behaviors by display name,
 * and positions via {@link mapPosition}. Bindings already identical on the
 * target are omitted to keep the number of RPC round-trips minimal.
 */
export function buildApplyPlan(
  profile: KeymapProfile,
  target: Keymap,
  targetBehaviors: Map<number, BehaviorDefinition>,
): ApplyPlan {
  const idByName = new Map<string, number>();
  for (const [id, definition] of targetBehaviors) {
    idByName.set(definition.displayName.trim().toLowerCase(), id);
  }

  const targetKeyCount = target.layers[0]?.bindings.length ?? 0;
  const entries: ApplyPlanEntry[] = [];
  const missingBehaviors = new Set<string>();
  let skippedPositions = 0;

  const layerCount = Math.min(profile.layers.length, target.layers.length);
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const sourceLayer = profile.layers[layerIndex];
    const targetLayer = target.layers[layerIndex];
    sourceLayer.bindings.forEach((sourceBinding, position) => {
      const targetPosition = mapPosition(
        position,
        profile.keyCount,
        targetKeyCount,
      );
      if (
        targetPosition === null ||
        targetPosition >= targetLayer.bindings.length
      ) {
        skippedPositions += 1;
        return;
      }
      const behaviorId = idByName.get(
        sourceBinding.behavior.trim().toLowerCase(),
      );
      if (behaviorId === undefined) {
        missingBehaviors.add(sourceBinding.behavior);
        return;
      }
      const binding: BehaviorBinding = {
        behaviorId,
        param1: sourceBinding.param1,
        param2: sourceBinding.param2,
      };
      const current = targetLayer.bindings[targetPosition];
      if (
        current &&
        current.behaviorId === binding.behaviorId &&
        current.param1 === binding.param1 &&
        current.param2 === binding.param2
      ) {
        return;
      }
      entries.push({
        layerId: targetLayer.id,
        keyPosition: targetPosition,
        binding,
      });
    });
  }

  return {
    entries,
    skippedBehaviors: [...missingBehaviors],
    skippedPositions,
    layerCountMismatch: profile.layers.length !== target.layers.length,
  };
}
