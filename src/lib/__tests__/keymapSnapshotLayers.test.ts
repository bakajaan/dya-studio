import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import { toSnapshotLayers } from "../keymapSnapshotLayers";

function keymapOf(): Keymap {
  return {
    layers: [
      {
        id: 0,
        name: "Base",
        bindings: [
          { behaviorId: 1, param1: 4, param2: 0 },
          { behaviorId: 2, param1: 0, param2: 0 },
        ],
      },
      {
        id: 1,
        name: "",
        bindings: [{ behaviorId: 3, param1: 1, param2: 2 }],
      },
    ],
    availableLayers: 0,
    maxLayerNameLength: 16,
  } as unknown as Keymap;
}

describe("toSnapshotLayers", () => {
  it("labels bindings with behavior names and non-zero params", () => {
    const layers = toSnapshotLayers(keymapOf(), (id) => `behavior-${id}`);

    expect(layers).toHaveLength(2);
    expect(layers[0].name).toBe("Base");
    expect(layers[0].bindings[0].label).toBe("behavior-1 4");
    expect(layers[0].bindings[1].label).toBe("behavior-2");
    expect(layers[1].bindings[0].label).toBe("behavior-3 1 2");
  });

  it("falls back to a positional name for unnamed layers", () => {
    const layers = toSnapshotLayers(keymapOf(), () => "x");
    expect(layers[1].name).toBe("Layer 1");
  });
});
