/**
 * Keymap snapshot history with diffing (version-management parity with
 * Oryx history / Keymap Editor's git-backed keymaps). Snapshots are stored
 * in an injected Storage-like object so the logic stays unit-testable.
 */

export interface SnapshotBinding {
  behaviorId: number;
  behaviorName: string;
  param1: number;
  param2: number;
  /** Human-readable label captured at snapshot time. */
  label: string;
}

export interface SnapshotLayer {
  name: string;
  bindings: SnapshotBinding[];
}

export interface KeymapSnapshot {
  id: string;
  savedAt: string;
  note: string;
  deviceName: string;
  layers: SnapshotLayer[];
}

export interface SnapshotDiffEntry {
  layerName: string;
  position: number;
  before: string | null;
  after: string | null;
}

export const SNAPSHOT_STORAGE_KEY = "dya-studio-keymap-snapshots";
export const SNAPSHOT_LIMIT = 30;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isKeymapSnapshot(value: unknown): value is KeymapSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<KeymapSnapshot>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.savedAt === "string" &&
    typeof candidate.note === "string" &&
    typeof candidate.deviceName === "string" &&
    Array.isArray(candidate.layers)
  );
}

export function listSnapshots(storage: StorageLike): KeymapSnapshot[] {
  try {
    const raw = storage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isKeymapSnapshot);
  } catch {
    return [];
  }
}

export function addSnapshot(
  storage: StorageLike,
  input: { note: string; deviceName: string; layers: SnapshotLayer[] },
  now: Date = new Date(),
  random: () => number = Math.random,
): KeymapSnapshot {
  const snapshot: KeymapSnapshot = {
    id: `${now.getTime().toString(36)}-${Math.floor(random() * 1679616).toString(36)}`,
    savedAt: now.toISOString(),
    note: input.note,
    deviceName: input.deviceName,
    layers: input.layers,
  };
  const next = [snapshot, ...listSnapshots(storage)].slice(0, SNAPSHOT_LIMIT);
  storage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
  return snapshot;
}

export function removeSnapshot(storage: StorageLike, id: string): void {
  const next = listSnapshots(storage).filter((snapshot) => snapshot.id !== id);
  storage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(next));
}

function bindingsEqual(a: SnapshotBinding, b: SnapshotBinding): boolean {
  return (
    a.behaviorId === b.behaviorId &&
    a.param1 === b.param1 &&
    a.param2 === b.param2
  );
}

/** Positions whose binding changed between two snapshots (layer-index based). */
export function diffSnapshots(
  before: KeymapSnapshot,
  after: KeymapSnapshot,
): SnapshotDiffEntry[] {
  const entries: SnapshotDiffEntry[] = [];
  const layerCount = Math.max(before.layers.length, after.layers.length);
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const beforeLayer = before.layers[layerIndex];
    const afterLayer = after.layers[layerIndex];
    const layerName =
      afterLayer?.name ?? beforeLayer?.name ?? `Layer ${layerIndex}`;
    const positionCount = Math.max(
      beforeLayer?.bindings.length ?? 0,
      afterLayer?.bindings.length ?? 0,
    );
    for (let position = 0; position < positionCount; position++) {
      const beforeBinding = beforeLayer?.bindings[position];
      const afterBinding = afterLayer?.bindings[position];
      if (!beforeBinding && !afterBinding) continue;
      if (
        beforeBinding &&
        afterBinding &&
        bindingsEqual(beforeBinding, afterBinding)
      ) {
        continue;
      }
      entries.push({
        layerName,
        position,
        before: beforeBinding ? beforeBinding.label : null,
        after: afterBinding ? afterBinding.label : null,
      });
    }
  }
  return entries;
}
