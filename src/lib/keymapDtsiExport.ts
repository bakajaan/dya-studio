/**
 * Export the current keymap as a ZMK devicetree keymap snippet
 * (Keymap Editor parity: repository-style artifact of the runtime keymap).
 * Best-effort: behaviors and keycodes without a known devicetree name are
 * emitted as raw values or comments so the output stays valid.
 */

export interface DtsiBinding {
  behaviorDisplayName: string;
  param1: number;
  param2: number;
}

export interface DtsiLayer {
  name: string;
  bindings: DtsiBinding[];
}

const MODIFIER_WRAPPERS: Array<{ bit: number; wrapper: string }> = [
  { bit: 0x01, wrapper: "LC" },
  { bit: 0x02, wrapper: "LS" },
  { bit: 0x04, wrapper: "LA" },
  { bit: 0x08, wrapper: "LG" },
  { bit: 0x10, wrapper: "RC" },
  { bit: 0x20, wrapper: "RS" },
  { bit: 0x40, wrapper: "RA" },
  { bit: 0x80, wrapper: "RG" },
];

const KEYBOARD_PAGE = 0x07;
const CONSUMER_PAGE = 0x0c;

const KEYBOARD_USAGE_NAMES: Record<number, string> = {
  4: "A",
  5: "B",
  6: "C",
  7: "D",
  8: "E",
  9: "F",
  10: "G",
  11: "H",
  12: "I",
  13: "J",
  14: "K",
  15: "L",
  16: "M",
  17: "N",
  18: "O",
  19: "P",
  20: "Q",
  21: "R",
  22: "S",
  23: "T",
  24: "U",
  25: "V",
  26: "W",
  27: "X",
  28: "Y",
  29: "Z",
  30: "N1",
  31: "N2",
  32: "N3",
  33: "N4",
  34: "N5",
  35: "N6",
  36: "N7",
  37: "N8",
  38: "N9",
  39: "N0",
  40: "RET",
  41: "ESC",
  42: "BSPC",
  43: "TAB",
  44: "SPACE",
  45: "MINUS",
  46: "EQUAL",
  47: "LBKT",
  48: "RBKT",
  49: "BSLH",
  50: "NON_US_HASH",
  51: "SEMI",
  52: "SQT",
  53: "GRAVE",
  54: "COMMA",
  55: "DOT",
  56: "FSLH",
  57: "CAPS",
  58: "F1",
  59: "F2",
  60: "F3",
  61: "F4",
  62: "F5",
  63: "F6",
  64: "F7",
  65: "F8",
  66: "F9",
  67: "F10",
  68: "F11",
  69: "F12",
  70: "PSCRN",
  71: "SLCK",
  72: "PAUSE_BREAK",
  73: "INS",
  74: "HOME",
  75: "PG_UP",
  76: "DEL",
  77: "END",
  78: "PG_DN",
  79: "RIGHT",
  80: "LEFT",
  81: "DOWN",
  82: "UP",
  83: "KP_NUM",
  84: "KP_SLASH",
  85: "KP_ASTERISK",
  86: "KP_MINUS",
  87: "KP_PLUS",
  88: "KP_ENTER",
  89: "KP_N1",
  90: "KP_N2",
  91: "KP_N3",
  92: "KP_N4",
  93: "KP_N5",
  94: "KP_N6",
  95: "KP_N7",
  96: "KP_N8",
  97: "KP_N9",
  98: "KP_N0",
  99: "KP_DOT",
  100: "NON_US_BSLH",
  101: "K_APP",
  135: "INT1",
  136: "INT2",
  137: "INT3",
  138: "INT4",
  139: "INT5",
  144: "LANG1",
  145: "LANG2",
  224: "LCTRL",
  225: "LSHFT",
  226: "LALT",
  227: "LGUI",
  228: "RCTRL",
  229: "RSHFT",
  230: "RALT",
  231: "RGUI",
};

const CONSUMER_USAGE_NAMES: Record<number, string> = {
  0x6f: "C_BRI_UP",
  0x70: "C_BRI_DN",
  0xb5: "C_NEXT",
  0xb6: "C_PREV",
  0xb7: "C_STOP",
  0xcd: "C_PP",
  0xe2: "C_MUTE",
  0xe9: "C_VOL_UP",
  0xea: "C_VOL_DN",
};

/** Format a ZMK keycode param ((mods << 24) | (page << 16) | usage). */
export function formatZmkKeycode(param: number): string {
  const modifiers = (param >>> 24) & 0xff;
  const page = (param >>> 16) & 0xff;
  const usageId = param & 0xffff;

  let name: string | undefined;
  if (page === KEYBOARD_PAGE || page === 0) {
    name = KEYBOARD_USAGE_NAMES[usageId];
  } else if (page === CONSUMER_PAGE) {
    name = CONSUMER_USAGE_NAMES[usageId];
  }

  let text = name ?? `0x${(param & 0x00ffffff).toString(16).toUpperCase()}`;
  for (const { bit, wrapper } of MODIFIER_WRAPPERS) {
    if (modifiers & bit) {
      text = `${wrapper}(${text})`;
    }
  }
  return text;
}

type BindingFormatter = (binding: DtsiBinding) => string;

const BEHAVIOR_FORMATTERS: Record<string, BindingFormatter> = {};

function register(names: string[], format: BindingFormatter): void {
  for (const name of names) {
    BEHAVIOR_FORMATTERS[name.toLowerCase()] = format;
  }
}

register(["Key Press", "kp", "key_press"], (b) => `&kp ${formatZmkKeycode(b.param1)}`);
register(["Momentary Layer", "mo", "momentary"], (b) => `&mo ${b.param1}`);
register(["To Layer", "to"], (b) => `&to ${b.param1}`);
register(["Toggle Layer", "tog", "toggle"], (b) => `&tog ${b.param1}`);
register(
  ["Layer-Tap", "lt", "layer_tap"],
  (b) => `&lt ${b.param1} ${formatZmkKeycode(b.param2)}`,
);
register(
  ["Mod-Tap", "mt", "mod_tap"],
  (b) => `&mt ${formatZmkKeycode(b.param1)} ${formatZmkKeycode(b.param2)}`,
);
register(["Trans", "Transparent"], () => "&trans");
register(["None"], () => "&none");
register(["Sticky Key", "sk", "sticky_key"], (b) => `&sk ${formatZmkKeycode(b.param1)}`);
register(["Sticky Layer", "sl", "sticky_layer"], (b) => `&sl ${b.param1}`);
register(["Caps Word", "caps_word"], () => "&caps_word");
register(["Key Repeat", "key_repeat"], () => "&key_repeat");
register(["Key Toggle", "kt", "key_toggle"], (b) => `&kt ${formatZmkKeycode(b.param1)}`);
register(["Bootloader", "bootloader"], () => "&bootloader");
register(["System Reset", "sys_reset", "reset"], () => "&sys_reset");
register(["Grave/Escape", "grave_escape", "gresc"], () => "&gresc");
register(["Studio Unlock", "studio_unlock"], () => "&studio_unlock");
register(
  ["Runtime Macro", "rmacro", "macro", "runtime_macro"],
  (b) => `&rmacro ${b.param1}`,
);
register(["Mouse Key Press", "mkp", "mouse key press"], (b) => `&mkp ${b.param1}`);

const BT_COMMANDS: Record<number, string> = {
  0: "BT_CLR",
  1: "BT_NXT",
  2: "BT_PRV",
  3: "BT_SEL",
  4: "BT_CLR_ALL",
  5: "BT_DISC",
};
register(["Bluetooth", "bt"], (b) => {
  const command = BT_COMMANDS[b.param1] ?? String(b.param1);
  return b.param1 === 3 || b.param1 === 5
    ? `&bt ${command} ${b.param2}`
    : `&bt ${command}`;
});

const OUT_COMMANDS: Record<number, string> = {
  0: "OUT_TOG",
  1: "OUT_USB",
  2: "OUT_BLE",
};
register(
  ["Output Selection", "out", "output"],
  (b) => `&out ${OUT_COMMANDS[b.param1] ?? String(b.param1)}`,
);

function sanitizeComment(text: string): string {
  return text.replace(/\*\//g, "* /");
}

export function formatDtsiBinding(binding: DtsiBinding): string {
  const formatter = BEHAVIOR_FORMATTERS[binding.behaviorDisplayName.toLowerCase()];
  if (formatter) return formatter(binding);
  return `&none /* ${sanitizeComment(binding.behaviorDisplayName)} ${binding.param1} ${binding.param2} */`;
}

function sanitizeNodeName(name: string, index: number): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  const base = /^[A-Za-z]/.test(cleaned) ? cleaned : `layer_${index}_${cleaned}`;
  return base.length > 0 ? base : `layer_${index}`;
}

export function generateKeymapDtsi(
  layers: DtsiLayer[],
  options: { columns?: number } = {},
): string {
  const columns = options.columns ?? 6;
  const lines: string[] = [];
  lines.push("// Generated by DYA Studio (Insights tab) - runtime keymap export.");
  lines.push(
    "// Review before committing: unknown behaviors/keycodes are emitted as raw values or comments.",
  );
  lines.push("/ {");
  lines.push("    keymap {");
  lines.push('        compatible = "zmk,keymap";');
  layers.forEach((layer, index) => {
    const nodeName = sanitizeNodeName(layer.name || `layer_${index}`, index);
    lines.push("");
    lines.push(`        ${nodeName} {`);
    lines.push(`            display-name = "${layer.name.replace(/"/g, "'")}";`);
    lines.push("            bindings = <");
    for (let i = 0; i < layer.bindings.length; i += columns) {
      const row = layer.bindings
        .slice(i, i + columns)
        .map(formatDtsiBinding)
        .join(" ");
      lines.push(`                ${row}`);
    }
    lines.push("            >;");
    lines.push("        };");
  });
  lines.push("    };");
  lines.push("};");
  lines.push("");
  return lines.join("\n");
}
