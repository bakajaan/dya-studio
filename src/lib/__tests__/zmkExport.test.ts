/**
 * Tests for ZMK keymap export utility
 */
import {
  getZMKKeycodeName,
  bindingToZMKString,
  generateZMKKeymapContent,
} from "../zmkExport";
import type { BehaviorDefinition } from "../../hooks/useKeymap";
import type { Keymap } from "../../hooks/useKeymap";

// Helper to create a minimal BehaviorDefinition
function makeBehavior(id: number, displayName: string): BehaviorDefinition {
  return { id, displayName, metadata: [] };
}

describe("getZMKKeycodeName", () => {
  it("should return letter names as-is", () => {
    expect(getZMKKeycodeName(0x04)).toBe("A");
    expect(getZMKKeycodeName(0x1d)).toBe("Z");
  });

  it("should add N prefix to number row keys", () => {
    expect(getZMKKeycodeName(0x1e)).toBe("N1");
    expect(getZMKKeycodeName(0x27)).toBe("N0");
  });

  it("should return function key names", () => {
    expect(getZMKKeycodeName(0x3a)).toBe("F1");
    expect(getZMKKeycodeName(0x45)).toBe("F12");
  });

  it("should return alias for modifier keys", () => {
    expect(getZMKKeycodeName(0xe0)).toBe("LCTRL");
    expect(getZMKKeycodeName(0xe1)).toBe("LSHIFT");
    expect(getZMKKeycodeName(0xe2)).toBe("LALT");
    expect(getZMKKeycodeName(0xe3)).toBe("LGUI");
  });

  it("should return alias for navigation keys", () => {
    expect(getZMKKeycodeName(0x28)).toBe("Return"); // aliases[0] for Enter
    expect(getZMKKeycodeName(0x29)).toBe("ESC");
    expect(getZMKKeycodeName(0x2a)).toBe("BSPC");
    expect(getZMKKeycodeName(0x2c)).toBe("SPC");
  });

  it("should handle modifiers wrapped around keys", () => {
    // Left Shift + A: 0x02 modifier (LS) in bits 24-31, code 0x04 in bits 0-15
    const lsA = (0x02 << 24) | 0x04;
    expect(getZMKKeycodeName(lsA)).toBe("LS(A)");
  });

  it("should handle multiple modifiers", () => {
    // Left Ctrl (0x01) + Left Shift (0x02) + A
    const lcLsA = ((0x01 | 0x02) << 24) | 0x04;
    const result = getZMKKeycodeName(lcLsA);
    expect(result).toContain("LC(");
    expect(result).toContain("LS(");
    expect(result).toContain("A");
  });

  it("should return consumer keycode alias", () => {
    // C_VOL_UP: createHidUsage(HID_USAGE_PAGE_CONSUMER=0x0c, 0xe9) = (0x0c << 16) | 0xe9
    const volUp = (0x0c << 16) | 0xe9;
    expect(getZMKKeycodeName(volUp)).toBe("C_VOL_UP");
  });
});

describe("bindingToZMKString", () => {
  it("should format trans binding", () => {
    const behavior = makeBehavior(1, "trans");
    expect(
      bindingToZMKString({ behaviorId: 1, param1: 0, param2: 0 }, behavior),
    ).toBe("&trans");
  });

  it("should format none binding", () => {
    const behavior = makeBehavior(2, "None");
    expect(
      bindingToZMKString({ behaviorId: 2, param1: 0, param2: 0 }, behavior),
    ).toBe("&none");
  });

  it("should format kp binding", () => {
    const behavior = makeBehavior(3, "Key Press");
    expect(
      bindingToZMKString({ behaviorId: 3, param1: 0x04, param2: 0 }, behavior),
    ).toBe("&kp A");
  });

  it("should format mo binding", () => {
    const behavior = makeBehavior(4, "Momentary Layer");
    expect(
      bindingToZMKString({ behaviorId: 4, param1: 1, param2: 0 }, behavior),
    ).toBe("&mo 1");
  });

  it("should format lt binding", () => {
    const behavior = makeBehavior(5, "Layer-Tap");
    expect(
      bindingToZMKString({ behaviorId: 5, param1: 1, param2: 0x04 }, behavior),
    ).toBe("&lt 1 A");
  });

  it("should format mt binding", () => {
    const behavior = makeBehavior(6, "Mod-Tap");
    expect(
      bindingToZMKString(
        { behaviorId: 6, param1: 0xe1, param2: 0x04 },
        behavior,
      ),
    ).toBe("&mt LSHIFT A");
  });

  it("should format bt binding", () => {
    const behavior = makeBehavior(7, "bt");
    expect(
      bindingToZMKString({ behaviorId: 7, param1: 0, param2: 0 }, behavior),
    ).toBe("&bt BT_CLR");
    expect(
      bindingToZMKString({ behaviorId: 7, param1: 3, param2: 0 }, behavior),
    ).toBe("&bt BT_SEL 0");
  });

  it("should format out binding", () => {
    const behavior = makeBehavior(8, "out");
    expect(
      bindingToZMKString({ behaviorId: 8, param1: 1, param2: 0 }, behavior),
    ).toBe("&out OUT_USB");
  });

  it("should format sys_reset binding", () => {
    const behavior = makeBehavior(9, "sys_reset");
    expect(
      bindingToZMKString({ behaviorId: 9, param1: 0, param2: 0 }, behavior),
    ).toBe("&sys_reset");
  });

  it("should format bootloader binding", () => {
    const behavior = makeBehavior(10, "bootloader");
    expect(
      bindingToZMKString({ behaviorId: 10, param1: 0, param2: 0 }, behavior),
    ).toBe("&bootloader");
  });
});

describe("generateZMKKeymapContent", () => {
  const behaviors = new Map<number, BehaviorDefinition>([
    [1, makeBehavior(1, "Key Press")],
    [2, makeBehavior(2, "trans")],
  ]);

  const keymap: Keymap = {
    layers: [
      {
        id: 0,
        name: "Base",
        bindings: [
          { behaviorId: 1, param1: 0x04, param2: 0 }, // A
          { behaviorId: 1, param1: 0x05, param2: 0 }, // B
        ],
      },
      {
        id: 1,
        name: "Lower",
        bindings: [
          { behaviorId: 2, param1: 0, param2: 0 }, // trans
          { behaviorId: 2, param1: 0, param2: 0 }, // trans
        ],
      },
    ],
    availableLayers: 4,
    maxLayerNameLength: 32,
  };

  it("should generate valid ZMK keymap structure", () => {
    const content = generateZMKKeymapContent({
      keymap,
      behaviors,
      physicalLayouts: null,
    });

    expect(content).toContain('compatible = "zmk,keymap"');
    expect(content).toContain("Base {");
    expect(content).toContain('display-name = "Base"');
    expect(content).toContain("&kp A");
    expect(content).toContain("&kp B");
    expect(content).toContain("Lower {");
    expect(content).toContain("&trans");
  });

  it("should sanitize layer names for DTS node names", () => {
    const keymapWithSpecialName: Keymap = {
      ...keymap,
      layers: [
        {
          id: 0,
          name: "My Layer 1",
          bindings: [{ behaviorId: 1, param1: 0x04, param2: 0 }],
        },
      ],
    };

    const content = generateZMKKeymapContent({
      keymap: keymapWithSpecialName,
      behaviors,
      physicalLayouts: null,
    });

    expect(content).toContain("My_Layer_1 {");
  });

  it("should wrap content in / { keymap { } }", () => {
    const content = generateZMKKeymapContent({
      keymap,
      behaviors,
      physicalLayouts: null,
    });

    expect(content.startsWith("/ {")).toBe(true);
    expect(content).toContain("    keymap {");
    expect(content.trimEnd().endsWith("};")).toBe(true);
  });

  it("should use physical layout to group bindings by row", () => {
    const physicalLayouts = {
      activeLayoutIndex: 0,
      layouts: [
        {
          name: "Default",
          keys: [
            // Two keys in row 1 (y=0), one key in row 2 (y=100)
            { x: 0, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
            { x: 100, y: 0, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
            { x: 0, y: 100, width: 100, height: 100, r: 0, rx: 0, ry: 0 },
          ],
        },
      ],
    };

    const keymapWithThreeKeys: Keymap = {
      ...keymap,
      layers: [
        {
          id: 0,
          name: "Base",
          bindings: [
            { behaviorId: 1, param1: 0x04, param2: 0 }, // A - row 1
            { behaviorId: 1, param1: 0x05, param2: 0 }, // B - row 1
            { behaviorId: 1, param1: 0x06, param2: 0 }, // C - row 2
          ],
        },
      ],
    };

    const content = generateZMKKeymapContent({
      keymap: keymapWithThreeKeys,
      behaviors,
      physicalLayouts,
    });

    // Should have C on a separate line from A and B
    const lines = content.split("\n");
    const abLine = lines.find(
      (l) => l.includes("&kp A") && l.includes("&kp B"),
    );
    const cLine = lines.find(
      (l) => l.includes("&kp C") && !l.includes("&kp A"),
    );

    expect(abLine).toBeDefined();
    expect(cLine).toBeDefined();
  });
});
