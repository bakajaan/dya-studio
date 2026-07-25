import type { Keymap } from "@zmkfirmware/zmk-studio-ts-client/keymap";
import type { BehaviorDefinition } from "../../hooks/useKeymapSource";
import {
  buildApplyPlan,
  mapPosition,
  parseProfileJson,
  serializeKeymap,
} from "../keymapProfile";

function behaviorMap(
  entries: Array<[number, string]>,
): Map<number, BehaviorDefinition> {
  return new Map(
    entries.map(([id, displayName]) => [id, { id, displayName, metadata: [] }]),
  );
}

function makeKeymap(keyCount: number, behaviorId: number): Keymap {
  return {
    layers: [
      {
        id: 0,
        name: "Default",
        bindings: Array.from({ length: keyCount }, () => ({
          behaviorId,
          param1: 0,
          param2: 0,
        })),
      },
    ],
    availableLayers: 0,
    maxLayerNameLength: 20,
  };
}

describe("mapPosition", () => {
  it("keeps positions when key counts match", () => {
    expect(mapPosition(12, 34, 34)).toBe(12);
  });

  it("maps 40-key thumbs to 34-key thumbs", () => {
    expect(mapPosition(29, 40, 34)).toBe(29);
    expect(mapPosition(33, 40, 34)).toBe(30);
    expect(mapPosition(36, 40, 34)).toBe(33);
  });

  it("drops the 40-key blank bottom keys", () => {
    expect(mapPosition(30, 40, 34)).toBeNull();
    expect(mapPosition(32, 40, 34)).toBeNull();
    expect(mapPosition(37, 40, 34)).toBeNull();
    expect(mapPosition(39, 40, 34)).toBeNull();
  });

  it("maps 34-key thumbs to 40-key thumbs", () => {
    expect(mapPosition(29, 34, 40)).toBe(29);
    expect(mapPosition(30, 34, 40)).toBe(33);
    expect(mapPosition(33, 34, 40)).toBe(36);
  });
});

describe("profile serialization and apply plan", () => {
  it("applies a 34-key profile to a 40-key keyboard by behavior name", () => {
    const source = makeKeymap(34, 1);
    source.layers[0].bindings[0] = { behaviorId: 1, param1: 4, param2: 0 };
    source.layers[0].bindings[30] = { behaviorId: 2, param1: 2, param2: 0 };
    const sourceBehaviors = behaviorMap([
      [1, "Key Press"],
      [2, "Momentary Layer"],
    ]);

    const profile = serializeKeymap(
      source,
      sourceBehaviors,
      "test",
      "aerogu34",
    );
    expect(profile.keyCount).toBe(34);

    const roundTripped = parseProfileJson(JSON.stringify(profile));
    expect(roundTripped).not.toBeNull();
    if (!roundTripped) throw new Error("profile did not round-trip");

    // Target keyboard uses DIFFERENT behavior ids for the same behaviors.
    const target = makeKeymap(40, 7);
    const targetBehaviors = behaviorMap([
      [7, "Key Press"],
      [9, "Momentary Layer"],
    ]);

    const plan = buildApplyPlan(roundTripped, target, targetBehaviors);
    expect(plan.entries).toEqual([
      {
        layerId: 0,
        keyPosition: 0,
        binding: { behaviorId: 7, param1: 4, param2: 0 },
      },
      {
        layerId: 0,
        keyPosition: 33,
        binding: { behaviorId: 9, param1: 2, param2: 0 },
      },
    ]);
    expect(plan.skippedBehaviors).toEqual([]);
    expect(plan.layerCountMismatch).toBe(false);
  });

  it("reports behaviors missing on the target keyboard", () => {
    const source = makeKeymap(34, 1);
    const sourceBehaviors = behaviorMap([[1, "Trackball"]]);
    const profile = serializeKeymap(source, sourceBehaviors, "tb", "aerogu34");

    const target = makeKeymap(34, 7);
    const targetBehaviors = behaviorMap([[7, "Key Press"]]);

    const plan = buildApplyPlan(profile, target, targetBehaviors);
    expect(plan.entries).toEqual([]);
    expect(plan.skippedBehaviors).toEqual(["Trackball"]);
  });
});
