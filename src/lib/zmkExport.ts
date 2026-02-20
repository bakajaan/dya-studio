/**
 * ZMK Keymap Export Utility
 *
 * Generates ZMK `.keymap` file content from keymap data.
 * The output follows ZMK's DTS keymap format.
 */
import type {
  BehaviorBinding,
  BehaviorDefinition,
  Keymap,
  PhysicalLayouts,
} from "../hooks/useKeymap";
import type { LayerBindings } from "../hooks/useRuntimeSensorRotate";
import {
  KEYBOARD_KEYCODES,
  CONSUMER_KEYCODES,
  MODIFIER_FLAGS,
  extractModifierFlags,
  dropModifierFlags,
  getHidUsagePage,
  getHidUsageCode,
  MOUSE_KEYCODES,
  MOUSE_MOVEMENTS,
  MOUSE_SCROLLS,
  decodeMouseMove,
} from "./keycodes";

// Pre-build a map from HID code to ZMK keycode name
const ZMK_KEYCODE_MAP = new Map<number, string>();

// Keyboard keycodes
KEYBOARD_KEYCODES.forEach((kc) => {
  // Number row (0x1E-0x27): add "N" prefix (N1-N0 in ZMK)
  if (kc.code >= 0x1e && kc.code <= 0x27) {
    ZMK_KEYCODE_MAP.set(kc.code, `N${kc.name}`);
  } else if (kc.aliases && kc.aliases.length > 0) {
    ZMK_KEYCODE_MAP.set(kc.code, kc.aliases[0]);
  } else {
    ZMK_KEYCODE_MAP.set(kc.code, kc.name);
  }
});

// Consumer keycodes (stored with full HID usage)
CONSUMER_KEYCODES.forEach((kc) => {
  const zmkName = kc.aliases && kc.aliases.length > 0 ? kc.aliases[0] : kc.name;
  ZMK_KEYCODE_MAP.set(kc.code, zmkName);
});

/**
 * Get ZMK keycode name from HID usage value.
 * Handles modifier wrapping (e.g., LC(A) for Left Ctrl + A).
 */
export function getZMKKeycodeName(hidUsage: number): string {
  const modifiers = extractModifierFlags(hidUsage);
  const withoutMods = dropModifierFlags(hidUsage);
  const page = getHidUsagePage(withoutMods);
  const code = getHidUsageCode(withoutMods);

  // Look up the base keycode name
  let baseName: string;
  if (page !== 0) {
    // Consumer or other non-keyboard page: look up by full usage
    baseName =
      ZMK_KEYCODE_MAP.get(withoutMods) ??
      `0x${withoutMods.toString(16).toUpperCase()}`;
  } else {
    // Keyboard page: look up by code
    baseName =
      ZMK_KEYCODE_MAP.get(code) ?? `0x${code.toString(16).toUpperCase()}`;
  }

  if (modifiers === 0) {
    return baseName;
  }

  // Wrap with modifier functions (innermost modifier first in ZMK)
  let result = baseName;
  // Apply modifiers from highest to lowest bit so they wrap correctly
  for (let i = MODIFIER_FLAGS.length - 1; i >= 0; i--) {
    const mod = MODIFIER_FLAGS[i];
    if (modifiers & mod.value) {
      result = `${mod.shortLabel}(${result})`;
    }
  }
  return result;
}

/**
 * Mapping from behavior displayName variants to ZMK behavior node name
 */
const BEHAVIOR_NODE_MAP: Record<string, string> = {
  "key press": "kp",
  kp: "kp",
  key_press: "kp",
  "momentary layer": "mo",
  mo: "mo",
  momentary: "mo",
  "to layer": "to",
  to: "to",
  "toggle layer": "tog",
  tog: "tog",
  toggle: "tog",
  "layer-tap": "lt",
  lt: "lt",
  layer_tap: "lt",
  "mod-tap": "mt",
  mt: "mt",
  mod_tap: "mt",
  trans: "trans",
  transparent: "trans",
  none: "none",
  bt: "bt",
  bluetooth: "bt",
  out: "out",
  output: "out",
  "output selection": "out",
  sys_reset: "sys_reset",
  reset: "sys_reset",
  bootloader: "bootloader",
  "sticky key": "sk",
  sk: "sk",
  sticky_key: "sk",
  "mouse key press": "mkp",
  mkp: "mkp",
  "mouse move": "mmv",
  mmv: "mmv",
  mouse_move: "mmv",
  "mouse scroll": "msc",
  msc: "msc",
  mouse_scroll: "msc",
  macro: "macro",
};

/**
 * BT command param1 to ZMK string
 */
const BT_PARAM_MAP: Record<number, string> = {
  0: "BT_CLR",
  1: "BT_NXT",
  2: "BT_PRV",
  3: "BT_SEL 0",
  4: "BT_SEL 1",
  5: "BT_SEL 2",
  6: "BT_SEL 3",
  7: "BT_SEL 4",
};

/**
 * OUT command param1 to ZMK string
 */
const OUT_PARAM_MAP: Record<number, string> = {
  0: "OUT_TOG",
  1: "OUT_USB",
  2: "OUT_BLE",
};

/**
 * Convert a behavior binding to its ZMK DTS string representation.
 * e.g. &kp A, &mo 1, &lt 1 A, &trans, &bt BT_CLR
 */
export function bindingToZMKString(
  binding: BehaviorBinding,
  behavior: BehaviorDefinition,
): string {
  const nodeName =
    BEHAVIOR_NODE_MAP[behavior.displayName.toLowerCase()] ??
    behavior.displayName.toLowerCase();

  switch (nodeName) {
    case "trans":
      return "&trans";
    case "none":
      return "&none";
    case "bootloader":
      return "&bootloader";
    case "sys_reset":
      return "&sys_reset";
    case "kp": {
      const key = getZMKKeycodeName(binding.param1);
      return `&kp ${key}`;
    }
    case "mo":
      return `&mo ${binding.param1}`;
    case "to":
      return `&to ${binding.param1}`;
    case "tog":
      return `&tog ${binding.param1}`;
    case "lt": {
      const key = getZMKKeycodeName(binding.param2);
      return `&lt ${binding.param1} ${key}`;
    }
    case "mt": {
      const mod = getZMKKeycodeName(binding.param1);
      const key = getZMKKeycodeName(binding.param2);
      return `&mt ${mod} ${key}`;
    }
    case "sk": {
      const key = getZMKKeycodeName(binding.param1);
      return `&sk ${key}`;
    }
    case "bt": {
      const cmd = BT_PARAM_MAP[binding.param1] ?? binding.param1.toString();
      return `&bt ${cmd}`;
    }
    case "out": {
      const cmd = OUT_PARAM_MAP[binding.param1] ?? binding.param1.toString();
      return `&out ${cmd}`;
    }
    case "mkp": {
      const btn = MOUSE_KEYCODES.find((mk) => mk.value === binding.param1);
      return `&mkp ${btn?.shortLabel ?? binding.param1}`;
    }
    case "mmv": {
      const preset = MOUSE_MOVEMENTS.find((mm) => mm.value === binding.param1);
      if (preset) {
        // Use ZMK pointing defines for common presets
        const moveMap: Record<string, string> = {
          "↑": "MOVE_UP",
          "↓": "MOVE_DOWN",
          "←": "MOVE_LEFT",
          "→": "MOVE_RIGHT",
        };
        return `&mmv ${moveMap[preset.shortLabel] ?? preset.label.toUpperCase().replace(/ /g, "_")}`;
      }
      const { x, y } = decodeMouseMove(binding.param1);
      return `&mmv MOVE_X(${x}) MOVE_Y(${y})`;
    }
    case "msc": {
      const preset = MOUSE_SCROLLS.find((ms) => ms.value === binding.param1);
      if (preset) {
        const scrollMap: Record<string, string> = {
          "↑": "SCRL_UP",
          "↓": "SCRL_DOWN",
          "←": "SCRL_LEFT",
          "→": "SCRL_RIGHT",
        };
        return `&msc ${scrollMap[preset.shortLabel] ?? preset.label.toUpperCase().replace(/ /g, "_")}`;
      }
      const { x, y } = decodeMouseMove(binding.param1);
      return `&msc SCRL_X(${x}) SCRL_Y(${y})`;
    }
    default:
      // Generic fallback
      if (binding.param1 !== 0 && binding.param2 !== 0) {
        return `&${nodeName} ${binding.param1} ${binding.param2}`;
      } else if (binding.param1 !== 0) {
        return `&${nodeName} ${binding.param1}`;
      }
      return `&${nodeName}`;
  }
}

/**
 * Parameters for generating ZMK keymap content
 */
export interface ZMKExportParams {
  keymap: Keymap;
  behaviors: Map<number, BehaviorDefinition>;
  physicalLayouts: PhysicalLayouts | null;
  /** Per-sensor bindings: sensorIndex -> LayerBindings[] */
  sensorBindings?: Map<number, LayerBindings[]>;
  /** Ordered sensor indices */
  sensorIndices?: number[];
}

/**
 * Generate ZMK `.keymap` file content from keymap data.
 *
 * Formats key bindings with:
 * - Newline when key Y position increases (new row)
 * - Spacing proportional to X-axis gap between keys
 */
export function generateZMKKeymapContent(params: ZMKExportParams): string {
  const { keymap, behaviors, physicalLayouts, sensorBindings, sensorIndices } =
    params;

  const activeLayoutIndex = physicalLayouts?.activeLayoutIndex ?? 0;
  const physicalLayout = physicalLayouts?.layouts[activeLayoutIndex] ?? null;

  const lines: string[] = [
    "/ {",
    "    keymap {",
    '        compatible = "zmk,keymap";',
  ];

  keymap.layers.forEach((layer, layerIndex) => {
    const layerName = (layer.name || `layer${layerIndex}`)
      .replace(/[^a-zA-Z0-9_]/g, "_")
      .replace(/^(\d)/, "_$1");

    lines.push(`        ${layerName} {`);
    lines.push(
      `            display-name = "${layer.name || `Layer ${layerIndex}`}";`,
    );

    // Build bindings string with layout-aware formatting
    const bindingStrings = layer.bindings.map((binding) => {
      const behavior = behaviors.get(binding.behaviorId);
      if (!behavior) {
        return `&none`;
      }
      return bindingToZMKString(binding, behavior);
    });

    const bindingsFormatted = formatBindings(
      bindingStrings,
      physicalLayout?.keys ?? null,
    );
    lines.push(`            bindings = <`);
    bindingsFormatted.forEach((line) => {
      lines.push(`                ${line}`);
    });
    lines.push(`            >;`);

    // Add sensor bindings if available for this layer
    if (sensorBindings && sensorIndices && sensorIndices.length > 0) {
      const sensorParts: string[] = [];

      for (const sensorIndex of sensorIndices) {
        const layerBindingsList = sensorBindings.get(sensorIndex);
        const layerBinding = layerBindingsList?.find(
          (lb) => lb.layer === layer.id,
        );

        if (layerBinding?.cwBinding && layerBinding?.ccwBinding) {
          const cwBehavior = behaviors.get(layerBinding.cwBinding.behaviorId);
          const ccwBehavior = behaviors.get(layerBinding.ccwBinding.behaviorId);
          if (cwBehavior && ccwBehavior) {
            const cwParam = getZMKKeycodeName(layerBinding.cwBinding.param1);
            const ccwParam = getZMKKeycodeName(layerBinding.ccwBinding.param1);
            sensorParts.push(`&inc_dec_kp ${cwParam} ${ccwParam}`);
          }
        } else {
          sensorParts.push("&inc_dec_kp C_VOL_UP C_VOL_DN");
        }
      }

      if (sensorParts.length > 0) {
        lines.push(`            sensor-bindings = <${sensorParts.join(" ")}>;`);
      }
    }

    lines.push(`        };`);
  });

  lines.push("    };");
  lines.push("};");

  return lines.join("\n");
}

/**
 * Format binding strings with layout-aware line breaks and spacing.
 *
 * Groups bindings by row (increasing Y position) and adds proportional spacing.
 */
function formatBindings(
  bindingStrings: string[],
  keys: { x: number; y: number; width: number; height: number }[] | null,
): string[] {
  if (!keys || keys.length === 0 || keys.length !== bindingStrings.length) {
    // Fallback: put all bindings on one line
    return [bindingStrings.join(" ")];
  }

  // Group by row (keys with same or increasing y)
  // A new row starts when y is greater than the max y seen so far
  const rows: Array<Array<{ binding: string; x: number }>> = [];
  let maxY = -Infinity;
  let currentRow: Array<{ binding: string; x: number }> = [];

  keys.forEach((key, i) => {
    if (key.y > maxY) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
      }
      currentRow = [];
      maxY = key.y;
    }
    currentRow.push({ binding: bindingStrings[i], x: key.x });
  });
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Format each row with spacing proportional to x-axis gap
  return rows.map((row) => {
    // Sort by x position within each row
    const sorted = [...row].sort((a, b) => a.x - b.x);

    if (sorted.length === 0) return "";

    // Simple approach: just join with spaces
    // For more precise spacing, we could calculate padding based on x gaps
    return sorted.map((item) => item.binding).join(" ");
  });
}
