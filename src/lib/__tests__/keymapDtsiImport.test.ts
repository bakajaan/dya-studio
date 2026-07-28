import { generateKeymapDtsi } from "../keymapDtsiExport";
import {
  importKeymapDtsi,
  parseBinding,
  parseKeymapDtsi,
  parseZmkKeycode,
} from "../keymapDtsiImport";

const KEYBOARD_PAGE = 0x07;
const A = (KEYBOARD_PAGE << 16) | 4;
const TAB = (KEYBOARD_PAGE << 16) | 43;
const LCTRL = (KEYBOARD_PAGE << 16) | 224;

describe("keymapDtsiImport", () => {
  it("parses keycodes including modifier wrappers", () => {
    expect(parseZmkKeycode("A")).toBe(A);
    expect(parseZmkKeycode("LC(A)")).toBe((0x01 << 24) | A);
    expect(parseZmkKeycode("LC(LS(A))")).toBe(((0x01 | 0x02) << 24) | A);
    expect(parseZmkKeycode("NOT_A_KEY")).toBeNull();
  });

  it("parses single bindings", () => {
    expect(parseBinding("&kp A")).toMatchObject({
      behavior: "Key Press",
      param1: A,
      param2: 0,
    });
    expect(parseBinding("&lt 1 TAB")).toMatchObject({
      behavior: "Layer-Tap",
      param1: 1,
      param2: TAB,
    });
    expect(parseBinding("&bt BT_SEL 2")).toMatchObject({
      behavior: "Bluetooth",
      param1: 3,
      param2: 2,
    });
    expect(parseBinding("&trans")).toMatchObject({ behavior: "Trans" });
  });

  it("keeps unknown behaviors with a warning", () => {
    const binding = parseBinding("&hml LGUI A");
    expect(binding.behavior).toBe("hml");
    expect(binding.warning).toContain("未対応");
  });

  it("round-trips an exported keymap", () => {
    const dtsi = generateKeymapDtsi([
      {
        name: "Base",
        bindings: [
          { behaviorDisplayName: "Key Press", param1: A, param2: 0 },
          { behaviorDisplayName: "Layer-Tap", param1: 1, param2: TAB },
          { behaviorDisplayName: "Mod-Tap", param1: LCTRL, param2: A },
          { behaviorDisplayName: "Trans", param1: 0, param2: 0 },
        ],
      },
      {
        name: "Nav",
        bindings: [
          { behaviorDisplayName: "Momentary Layer", param1: 2, param2: 0 },
          { behaviorDisplayName: "None", param1: 0, param2: 0 },
        ],
      },
    ]);

    const parsed = parseKeymapDtsi(dtsi);
    expect(parsed.layers).toHaveLength(2);
    expect(parsed.layers[0].displayName).toBe("Base");
    expect(parsed.layers[0].bindings).toHaveLength(4);
    expect(parsed.layers[0].bindings[0]).toMatchObject({
      behavior: "Key Press",
      param1: A,
    });
    expect(parsed.layers[0].bindings[2]).toMatchObject({
      behavior: "Mod-Tap",
      param1: LCTRL,
      param2: A,
    });
    expect(parsed.layers[1].displayName).toBe("Nav");
    expect(parsed.warnings).toHaveLength(0);
  });

  it("ignores comments and non-keymap nodes", () => {
    const dtsi = `
      / {
        behaviors {
          hml: home_row_mod_left {
            compatible = "zmk,behavior-hold-tap";
            bindings = <&kp>, <&kp>;
          };
        };
        keymap {
          compatible = "zmk,keymap";
          default_layer {
            display-name = "Base"; // レイヤー名
            bindings = <
              &kp A /* 左手 */ &kp B
            >;
          };
        };
      };
    `;
    const parsed = parseKeymapDtsi(dtsi);
    expect(parsed.layers).toHaveLength(1);
    expect(parsed.layers[0].bindings).toHaveLength(2);
  });

  it("converts to a profile that can be applied", () => {
    const dtsi = generateKeymapDtsi([
      {
        name: "Base",
        bindings: [{ behaviorDisplayName: "Key Press", param1: A, param2: 0 }],
      },
    ]);
    const { profile, warnings } = importKeymapDtsi(dtsi, {
      name: "keymap34.dtsi",
      deviceName: "jisaku_1",
      now: new Date("2026-07-28T00:00:00Z"),
    });
    expect(warnings).toHaveLength(0);
    expect(profile.version).toBe(1);
    expect(profile.keyCount).toBe(1);
    expect(profile.layers[0].bindings[0].behavior).toBe("Key Press");
  });
});
