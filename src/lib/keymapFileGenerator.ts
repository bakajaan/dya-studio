import type {
  BehaviorDefinition,
  Keymap,
  BehaviorBinding,
} from "../hooks/useKeymap";

const SPECIAL_KEYS: Record<number, string> = {
  0x28: "RET",
  0x29: "ESC",
  0x2a: "BSPC",
  0x2b: "TAB",
  0x2c: "SPACE",
  0x2d: "MINUS",
  0x2e: "EQUAL",
  0x2f: "LBKT",
  0x30: "RBKT",
  0x31: "BSLH",
  0x32: "NUHS",
  0x33: "SEMI",
  0x34: "SQT",
  0x35: "GRAVE",
  0x36: "COMMA",
  0x37: "DOT",
  0x38: "FSLH",
  0x39: "CAPS",
  0x46: "PSCRN",
  0x47: "SLCK",
  0x48: "PAUSE",
  0x49: "INS",
  0x4a: "HOME",
  0x4b: "PG_UP",
  0x4c: "DEL",
  0x4d: "END",
  0x4e: "PG_DN",
  0x4f: "RIGHT",
  0x50: "LEFT",
  0x51: "DOWN",
  0x52: "UP",
  0x53: "KP_NUM",
  0x54: "KP_SLASH",
  0x55: "KP_MULTIPLY",
  0x56: "KP_MINUS",
  0x57: "KP_PLUS",
  0x58: "KP_ENTER",
  0x59: "KP_N1",
  0x5a: "KP_N2",
  0x5b: "KP_N3",
  0x5c: "KP_N4",
  0x5d: "KP_N5",
  0x5e: "KP_N6",
  0x5f: "KP_N7",
  0x60: "KP_N8",
  0x61: "KP_N9",
  0x62: "KP_N0",
  0xe0: "LCTRL",
  0xe1: "LSHFT",
  0xe2: "LALT",
  0xe3: "LGUI",
  0xe4: "RCTRL",
  0xe5: "RSHFT",
  0xe6: "RALT",
  0xe7: "RGUI",
};

export function getZmkKeycodeName(hidCode: number): string {
  if (hidCode >= 0x04 && hidCode <= 0x1d) {
    return String.fromCharCode(65 + (hidCode - 0x04));
  }
  if (hidCode >= 0x1e && hidCode <= 0x26) {
    return `N${hidCode - 0x1d}`;
  }
  if (hidCode === 0x27) return "N0";
  if (hidCode >= 0x3a && hidCode <= 0x45) {
    return `F${hidCode - 0x39}`;
  }
  if (hidCode >= 0x68 && hidCode <= 0x73) {
    return `F${hidCode - 0x68 + 13}`;
  }
  if (SPECIAL_KEYS[hidCode]) return SPECIAL_KEYS[hidCode];
  return `0x${hidCode.toString(16).toUpperCase()}`;
}

const BT_PARAMS: Record<number, string> = {
  0: "BT_CLR",
  1: "BT_NXT",
  2: "BT_PRV",
};

export function bindingToZmk(
  binding: BehaviorBinding,
  behaviors: Map<number, BehaviorDefinition>,
): string {
  const behavior = behaviors.get(binding.behaviorId);
  if (!behavior) return `&unknown`;

  const name = behavior.displayName.toLowerCase();

  if (
    name === "trans" ||
    name === "transparent" ||
    behavior.displayName === "&trans"
  )
    return "&trans";
  if (name === "none" || behavior.id === 6) return "&none";
  if (name === "bootloader") return "&bootloader";
  if (name === "sys_reset" || name === "reset") return "&sys_reset";

  if (
    name === "kp" ||
    name === "key press" ||
    behavior.displayName === "Key Press"
  ) {
    return `&kp ${getZmkKeycodeName(binding.param1)}`;
  }

  if (name === "bt" || name === "bluetooth") {
    const p1 = binding.param1;
    if (p1 <= 2) return `&bt ${BT_PARAMS[p1]}`;
    return `&bt BT_SEL ${p1 - 3}`;
  }

  if (name === "mo" || name === "momentary layer") {
    return `&mo ${binding.param1}`;
  }

  if (name === "lt" || name === "layer-tap") {
    return `&lt ${binding.param1} ${getZmkKeycodeName(binding.param2)}`;
  }

  if (name === "mt" || name === "mod-tap") {
    return `&mt ${getZmkKeycodeName(binding.param1)} ${getZmkKeycodeName(binding.param2)}`;
  }

  if (name === "to layer" || name === "to") {
    return `&to ${binding.param1}`;
  }

  if (name === "toggle layer" || name === "tog") {
    return `&tog ${binding.param1}`;
  }

  if (name === "sticky key" || name === "sk") {
    return `&sk ${getZmkKeycodeName(binding.param1)}`;
  }

  const id = behavior.displayName.toLowerCase().replace(/\s+/g, "_");
  return `&${id}`;
}

export function patchKeymapFile(
  content: string,
  keymap: Keymap,
  behaviors: Map<number, BehaviorDefinition>,
): string {
  const layers = keymap.layers;
  let layerIndex = 0;
  return content.replace(/bindings\s*=\s*<([^>]*)>/gs, (_match: string) => {
    if (layerIndex >= layers.length) {
      layerIndex++;
      return _match;
    }
    const layer = layers[layerIndex++];
    const zmkBindings = layer.bindings.map((b) => bindingToZmk(b, behaviors));
    const lines: string[] = [];
    for (let i = 0; i < zmkBindings.length; i += 8) {
      lines.push("                " + zmkBindings.slice(i, i + 8).join(" "));
    }
    return `bindings = <\n${lines.join("\n")}\n            >`;
  });
}

export interface DiffLine {
  type: "unchanged" | "added" | "removed";
  content: string;
  lineNumber: { old: number | null; new: number | null };
}

export function generateDiff(original: string, modified: string): DiffLine[] {
  const oldLines = original.split("\n");
  const newLines = modified.split("\n");
  const result: DiffLine[] = [];

  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array(n + 1).fill(0),
  );

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = 0,
    j = 0;
  let oldNum = 1,
    newNum = 1;

  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({
        type: "unchanged",
        content: oldLines[i],
        lineNumber: { old: oldNum++, new: newNum++ },
      });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({
        type: "added",
        content: newLines[j],
        lineNumber: { old: null, new: newNum++ },
      });
      j++;
    } else {
      result.push({
        type: "removed",
        content: oldLines[i],
        lineNumber: { old: oldNum++, new: null },
      });
      i++;
    }
  }

  return result;
}
