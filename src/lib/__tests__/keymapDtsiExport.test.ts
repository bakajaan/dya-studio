import {
  formatDtsiBinding,
  formatZmkKeycode,
  generateKeymapDtsi,
} from "../keymapDtsiExport";

const KP = (usage: number) => (0x07 << 16) | usage;

describe("keymapDtsiExport", () => {
  it("formats plain keycodes", () => {
    expect(formatZmkKeycode(KP(4))).toBe("A");
    expect(formatZmkKeycode(KP(44))).toBe("SPACE");
    expect(formatZmkKeycode(KP(137))).toBe("INT3");
  });

  it("wraps modifiers", () => {
    expect(formatZmkKeycode((0x02 << 24) | KP(4))).toBe("LS(A)");
    expect(formatZmkKeycode((0x09 << 24) | KP(4))).toBe("LG(LC(A))");
  });

  it("formats consumer usages", () => {
    expect(formatZmkKeycode((0x0c << 16) | 0xe9)).toBe("C_VOL_UP");
  });

  it("falls back to raw hex for unknown usages", () => {
    expect(formatZmkKeycode(KP(999))).toContain("0x");
  });

  it("formats bindings by behavior display name", () => {
    expect(
      formatDtsiBinding({
        behaviorDisplayName: "Key Press",
        param1: KP(4),
        param2: 0,
      }),
    ).toBe("&kp A");
    expect(
      formatDtsiBinding({
        behaviorDisplayName: "Momentary Layer",
        param1: 2,
        param2: 0,
      }),
    ).toBe("&mo 2");
    expect(
      formatDtsiBinding({ behaviorDisplayName: "Trans", param1: 0, param2: 0 }),
    ).toBe("&trans");
    expect(
      formatDtsiBinding({
        behaviorDisplayName: "Layer-Tap",
        param1: 1,
        param2: KP(44),
      }),
    ).toBe("&lt 1 SPACE");
    expect(
      formatDtsiBinding({
        behaviorDisplayName: "Bluetooth",
        param1: 3,
        param2: 1,
      }),
    ).toBe("&bt BT_SEL 1");
  });

  it("comments out unknown behaviors", () => {
    expect(
      formatDtsiBinding({
        behaviorDisplayName: "Custom Thing",
        param1: 1,
        param2: 2,
      }),
    ).toContain("&none /*");
  });

  it("generates a keymap node", () => {
    const dtsi = generateKeymapDtsi([
      {
        name: "Base",
        bindings: [
          { behaviorDisplayName: "Key Press", param1: KP(4), param2: 0 },
          { behaviorDisplayName: "Trans", param1: 0, param2: 0 },
        ],
      },
    ]);
    expect(dtsi).toContain('compatible = "zmk,keymap"');
    expect(dtsi).toContain('display-name = "Base"');
    expect(dtsi).toContain("&kp A &trans");
  });
});
