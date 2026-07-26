import {
  buildRecorderSteps,
  hidUsageForEventCode,
  keyParamForEventCode,
  type RecordedKeyEvent,
} from "../macroRecorder";

describe("macroRecorder", () => {
  it("maps KeyboardEvent codes to HID usages", () => {
    expect(hidUsageForEventCode("KeyA")).toBe(4);
    expect(hidUsageForEventCode("KeyZ")).toBe(29);
    expect(hidUsageForEventCode("Digit1")).toBe(30);
    expect(hidUsageForEventCode("Digit0")).toBe(39);
    expect(hidUsageForEventCode("Space")).toBe(44);
    expect(hidUsageForEventCode("F12")).toBe(69);
    expect(hidUsageForEventCode("IntlYen")).toBe(137);
    expect(hidUsageForEventCode("ShiftLeft")).toBe(225);
    expect(hidUsageForEventCode("UnknownKey")).toBeNull();
  });

  it("encodes ZMK keycode params with the keyboard page", () => {
    expect(keyParamForEventCode("KeyA")).toBe((0x07 << 16) | 4);
    expect(keyParamForEventCode("UnknownKey")).toBeNull();
  });

  it("collapses down+up pairs into taps", () => {
    const events: RecordedKeyEvent[] = [
      { code: "KeyA", kind: "down", timeMs: 0 },
      { code: "KeyA", kind: "up", timeMs: 50 },
      { code: "KeyB", kind: "down", timeMs: 100 },
      { code: "KeyB", kind: "up", timeMs: 150 },
    ];
    const steps = buildRecorderSteps(events);
    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ action: "tap", code: "KeyA" });
    expect(steps[1]).toMatchObject({ action: "tap", code: "KeyB" });
  });

  it("keeps chords as down/up steps", () => {
    const events: RecordedKeyEvent[] = [
      { code: "ShiftLeft", kind: "down", timeMs: 0 },
      { code: "KeyA", kind: "down", timeMs: 20 },
      { code: "KeyA", kind: "up", timeMs: 60 },
      { code: "ShiftLeft", kind: "up", timeMs: 80 },
    ];
    const steps = buildRecorderSteps(events);
    expect(steps.map((step) => step.action)).toEqual(["down", "tap", "up"]);
    expect(steps[0].code).toBe("ShiftLeft");
    expect(steps[2].code).toBe("ShiftLeft");
  });

  it("skips key auto-repeat downs", () => {
    const events: RecordedKeyEvent[] = [
      { code: "KeyA", kind: "down", timeMs: 0 },
      { code: "KeyA", kind: "down", timeMs: 30 },
      { code: "KeyA", kind: "down", timeMs: 60 },
      { code: "KeyA", kind: "up", timeMs: 90 },
    ];
    const steps = buildRecorderSteps(events);
    expect(steps.map((step) => step.action)).toEqual(["down", "up"]);
  });

  it("ignores unmapped keys", () => {
    const events: RecordedKeyEvent[] = [
      { code: "MediaPlayPause", kind: "down", timeMs: 0 },
      { code: "KeyA", kind: "down", timeMs: 10 },
      { code: "KeyA", kind: "up", timeMs: 20 },
    ];
    const steps = buildRecorderSteps(events);
    expect(steps).toHaveLength(1);
    expect(steps[0].action).toBe("tap");
  });

  it("inserts delays between steps when enabled", () => {
    const events: RecordedKeyEvent[] = [
      { code: "KeyA", kind: "down", timeMs: 0 },
      { code: "KeyA", kind: "up", timeMs: 50 },
      { code: "KeyB", kind: "down", timeMs: 500 },
      { code: "KeyB", kind: "up", timeMs: 550 },
    ];
    const steps = buildRecorderSteps(events, {
      includeDelays: true,
      minDelayMs: 120,
    });
    expect(steps.map((step) => step.action)).toEqual(["tap", "delay", "tap"]);
    expect(steps[1].delayMs).toBe(450);
  });
});
