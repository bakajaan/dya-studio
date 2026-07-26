import {
  SNAPSHOT_LIMIT,
  addSnapshot,
  diffSnapshots,
  listSnapshots,
  removeSnapshot,
  type SnapshotLayer,
} from "../keymapSnapshots";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function layersWith(label: string): SnapshotLayer[] {
  return [
    {
      name: "Base",
      bindings: [
        {
          behaviorId: 1,
          behaviorName: "Key Press",
          param1: 4,
          param2: 0,
          label,
        },
      ],
    },
  ];
}

describe("keymapSnapshots", () => {
  it("adds, lists (newest first) and removes snapshots", () => {
    const storage = memoryStorage();
    const first = addSnapshot(
      storage,
      { note: "first", deviceName: "jisaku_1", layers: layersWith("A") },
      new Date("2026-01-01T00:00:00Z"),
      () => 0.5,
    );
    const second = addSnapshot(
      storage,
      { note: "second", deviceName: "jisaku_1", layers: layersWith("B") },
      new Date("2026-01-02T00:00:00Z"),
      () => 0.5,
    );
    const listed = listSnapshots(storage);
    expect(listed).toHaveLength(2);
    expect(listed[0].note).toBe("second");
    removeSnapshot(storage, first.id);
    expect(listSnapshots(storage)).toHaveLength(1);
    expect(listSnapshots(storage)[0].id).toBe(second.id);
  });

  it("keeps at most SNAPSHOT_LIMIT snapshots", () => {
    const storage = memoryStorage();
    for (let i = 0; i < SNAPSHOT_LIMIT + 5; i++) {
      addSnapshot(
        storage,
        { note: `n${i}`, deviceName: "kb", layers: [] },
        new Date(2026, 0, 1, 0, 0, i),
      );
    }
    expect(listSnapshots(storage)).toHaveLength(SNAPSHOT_LIMIT);
    expect(listSnapshots(storage)[0].note).toBe(`n${SNAPSHOT_LIMIT + 4}`);
  });

  it("returns empty list for corrupted storage", () => {
    const storage = memoryStorage();
    storage.setItem("dya-studio-keymap-snapshots", "not json");
    expect(listSnapshots(storage)).toEqual([]);
  });

  it("diffs changed positions between snapshots", () => {
    const storage = memoryStorage();
    const before = addSnapshot(storage, {
      note: "before",
      deviceName: "kb",
      layers: layersWith("A"),
    });
    const afterLayers = layersWith("B");
    afterLayers[0].bindings[0].param1 = 5;
    afterLayers[0].bindings.push({
      behaviorId: 2,
      behaviorName: "Momentary Layer",
      param1: 1,
      param2: 0,
      label: "MO 1",
    });
    const after = addSnapshot(storage, {
      note: "after",
      deviceName: "kb",
      layers: afterLayers,
    });
    const diff = diffSnapshots(before, after);
    expect(diff).toEqual([
      { layerName: "Base", position: 0, before: "A", after: "B" },
      { layerName: "Base", position: 1, before: null, after: "MO 1" },
    ]);
  });

  it("reports no diff for identical snapshots", () => {
    const storage = memoryStorage();
    const snapshot = addSnapshot(storage, {
      note: "x",
      deviceName: "kb",
      layers: layersWith("A"),
    });
    expect(diffSnapshots(snapshot, snapshot)).toEqual([]);
  });
});
