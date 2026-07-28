import {
  AUTO_SNAPSHOT_ENABLED_KEY,
  buildAutoSnapshotNote,
  evaluateAutoSnapshot,
  isAutoSnapshotEnabled,
  layersEqual,
  maybeAutoSnapshot,
  setAutoSnapshotEnabled,
} from "../autoSnapshot";
import { listSnapshots, type SnapshotLayer } from "../keymapSnapshots";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function layers(param1: number): SnapshotLayer[] {
  return [
    {
      name: "Base",
      bindings: [
        {
          behaviorId: 1,
          behaviorName: "Key Press",
          param1,
          param2: 0,
          label: "A",
        },
      ],
    },
  ];
}

const NOW = new Date("2026-07-28T11:20:00Z");

describe("autoSnapshot", () => {
  it("is enabled by default and can be toggled", () => {
    const storage = memoryStorage();
    expect(isAutoSnapshotEnabled(storage)).toBe(true);
    setAutoSnapshotEnabled(storage, false);
    expect(storage.data.get(AUTO_SNAPSHOT_ENABLED_KEY)).toBe("false");
    expect(isAutoSnapshotEnabled(storage)).toBe(false);
    setAutoSnapshotEnabled(storage, true);
    expect(isAutoSnapshotEnabled(storage)).toBe(true);
  });

  it("compares bindings, ignoring labels", () => {
    const a = layers(4);
    const b = layers(4);
    b[0].bindings[0].label = "ち";
    expect(layersEqual(a, b)).toBe(true);
    expect(layersEqual(a, layers(5))).toBe(false);
  });

  it("skips when disabled, unchanged, or too soon", () => {
    expect(
      evaluateAutoSnapshot({
        enabled: false,
        latest: undefined,
        layers: layers(4),
        now: NOW,
      }).reason,
    ).toBe("disabled");

    const latest = {
      id: "x",
      savedAt: new Date(NOW.getTime() - 5000).toISOString(),
      note: "自動保存",
      deviceName: "jisaku_1",
      layers: layers(4),
    };
    expect(
      evaluateAutoSnapshot({
        enabled: true,
        latest,
        layers: layers(4),
        now: NOW,
      }).reason,
    ).toBe("no-changes");
    expect(
      evaluateAutoSnapshot({
        enabled: true,
        latest,
        layers: layers(5),
        now: NOW,
      }).reason,
    ).toBe("too-soon");
    expect(
      evaluateAutoSnapshot({
        enabled: true,
        latest,
        layers: layers(5),
        now: new Date(NOW.getTime() + 120_000),
      }),
    ).toEqual({ shouldSnapshot: true, reason: "ok" });
  });

  it("creates a snapshot on save and skips the identical next save", () => {
    const storage = memoryStorage();
    const first = maybeAutoSnapshot(
      storage,
      { deviceName: "jisaku_1", layers: layers(4) },
      NOW,
      () => 0.5,
    );
    expect(first).not.toBeNull();
    expect(first?.note).toContain("自動保存");

    const second = maybeAutoSnapshot(
      storage,
      { deviceName: "jisaku_1", layers: layers(4) },
      new Date(NOW.getTime() + 300_000),
      () => 0.5,
    );
    expect(second).toBeNull();

    const third = maybeAutoSnapshot(
      storage,
      { deviceName: "jisaku_1", layers: layers(5), noteSuffix: "Save" },
      new Date(NOW.getTime() + 600_000),
      () => 0.5,
    );
    expect(third).not.toBeNull();
    expect(third?.note).toContain("Save");
    expect(listSnapshots(storage)).toHaveLength(2);
  });

  it("does nothing when disabled", () => {
    const storage = memoryStorage();
    setAutoSnapshotEnabled(storage, false);
    expect(
      maybeAutoSnapshot(
        storage,
        { deviceName: "jisaku_1", layers: layers(4) },
        NOW,
      ),
    ).toBeNull();
    expect(listSnapshots(storage)).toHaveLength(0);
  });

  it("formats the note", () => {
    const note = buildAutoSnapshotNote(new Date(2026, 6, 28, 11, 20));
    expect(note).toBe("自動保存 2026-07-28 11:20");
  });
});
