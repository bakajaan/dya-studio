/**
 * Macro recorder core (Vial-style "record what I type" parity): maps browser
 * KeyboardEvent.code values to HID keyboard-page usages and turns a recorded
 * down/up event stream into macro steps (tap-collapsed, optional delays).
 * The UI converts RecorderStep values into runtime-macro MacroStep messages.
 */

export const HID_KEYBOARD_PAGE = 0x07;

const table: Record<string, number> = {};
for (let i = 0; i < 26; i++) {
  table[`Key${String.fromCharCode(65 + i)}`] = 4 + i;
}
for (let i = 1; i <= 9; i++) {
  table[`Digit${i}`] = 29 + i;
}
table["Digit0"] = 39;
Object.assign(table, {
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Space: 44,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  CapsLock: 57,
});
for (let i = 1; i <= 12; i++) {
  table[`F${i}`] = 57 + i;
}
Object.assign(table, {
  PrintScreen: 70,
  ScrollLock: 71,
  Pause: 72,
  Insert: 73,
  Home: 74,
  PageUp: 75,
  Delete: 76,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
  NumLock: 83,
  NumpadDivide: 84,
  NumpadMultiply: 85,
  NumpadSubtract: 86,
  NumpadAdd: 87,
  NumpadEnter: 88,
  Numpad0: 98,
  NumpadDecimal: 99,
  IntlBackslash: 100,
  ContextMenu: 101,
  IntlRo: 135,
  KanaMode: 136,
  IntlYen: 137,
  Convert: 138,
  NonConvert: 139,
  ControlLeft: 224,
  ShiftLeft: 225,
  AltLeft: 226,
  MetaLeft: 227,
  ControlRight: 228,
  ShiftRight: 229,
  AltRight: 230,
  MetaRight: 231,
});
for (let i = 1; i <= 9; i++) {
  table[`Numpad${i}`] = 88 + i;
}

export const EVENT_CODE_TO_HID: Readonly<Record<string, number>> = table;

export function hidUsageForEventCode(code: string): number | null {
  return EVENT_CODE_TO_HID[code] ?? null;
}

/** ZMK keycode param for &kp-style bindings: (page << 16) | usage. */
export function keyParamForEventCode(code: string): number | null {
  const usage = hidUsageForEventCode(code);
  return usage === null ? null : (HID_KEYBOARD_PAGE << 16) | usage;
}

export interface RecordedKeyEvent {
  code: string;
  kind: "down" | "up";
  timeMs: number;
}

export interface RecorderStep {
  action: "tap" | "down" | "up" | "delay";
  /** ZMK keycode param ((page << 16) | usage) for key actions. */
  param?: number;
  /** Original KeyboardEvent.code for display. */
  code?: string;
  delayMs?: number;
}

export function buildRecorderSteps(
  events: RecordedKeyEvent[],
  options: { includeDelays?: boolean; minDelayMs?: number } = {},
): RecorderStep[] {
  const includeDelays = options.includeDelays ?? false;
  const minDelayMs = options.minDelayMs ?? 120;
  const steps: RecorderStep[] = [];
  const heldCodes = new Set<string>();
  let previousTimeMs: number | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const param = keyParamForEventCode(event.code);
    if (param === null) continue;

    if (includeDelays && previousTimeMs !== null) {
      const gap = Math.round(event.timeMs - previousTimeMs);
      if (gap >= minDelayMs) {
        steps.push({ action: "delay", delayMs: gap });
      }
    }
    previousTimeMs = event.timeMs;

    if (event.kind === "down") {
      // OS key auto-repeat shows up as repeated downs while held.
      if (heldCodes.has(event.code)) continue;
      const next = events[i + 1];
      if (next && next.kind === "up" && next.code === event.code) {
        steps.push({ action: "tap", param, code: event.code });
        previousTimeMs = next.timeMs;
        i += 1;
        continue;
      }
      heldCodes.add(event.code);
      steps.push({ action: "down", param, code: event.code });
    } else {
      if (!heldCodes.has(event.code)) continue;
      heldCodes.delete(event.code);
      steps.push({ action: "up", param, code: event.code });
    }
  }

  return steps;
}
