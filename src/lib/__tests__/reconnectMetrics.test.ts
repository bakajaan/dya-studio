import {
  RECONNECT_STORAGE_KEY,
  clearReconnectEvents,
  formatDurationMs,
  listReconnectEvents,
  recordReconnectEvent,
  startReconnectTimer,
  summarizeReconnects,
} from "../reconnectMetrics";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function record(
  storage: ReturnType<typeof memoryStorage>,
  durationMs: number,
  minuteOffset: number,
  outcome: "connected" | "failed" = "connected",
) {
  return recordReconnectEvent(
    storage,
    {
      startedAt: new Date(Date.parse("2026-07-28T00:00:00Z") + minuteOffset * 60000),
      durationMs,
      transport: "ble",
      trigger: "auto",
      outcome,
      deviceKey: "jisaku_1",
    },
    () => 0.5,
  );
}

describe("reconnectMetrics", () => {
  it("records and lists events newest first", () => {
    const storage = memoryStorage();
    record(storage, 1200, 0);
    record(storage, 900, 1);
    const events = listReconnectEvents(storage);
    expect(events).toHaveLength(2);
    expect(events[0].durationMs).toBe(900);
    expect(events[0].transport).toBe("ble");
  });

  it("summarizes median, p90 and success rate", () => {
    const storage = memoryStorage();
    [500, 1000, 1500, 2000, 8000].forEach((duration, index) => {
      record(storage, duration, index);
    });
    record(storage, 0, 10, "failed");

    const summary = summarizeReconnects(listReconnectEvents(storage), {
      transport: "ble",
    });
    expect(summary.attempts).toBe(6);
    expect(summary.successes).toBe(5);
    expect(summary.successRate).toBeCloseTo(5 / 6, 6);
    expect(summary.medianMs).toBe(1500);
    expect(summary.p90Ms).toBe(8000);
    expect(summary.bestMs).toBe(500);
    expect(summary.worstMs).toBe(8000);
    expect(summary.meanMs).toBeCloseTo(2600, 6);
  });

  it("filters by device and time window", () => {
    const storage = memoryStorage();
    record(storage, 1000, 0);
    recordReconnectEvent(storage, {
      startedAt: new Date("2026-07-28T01:00:00Z"),
      durationMs: 4000,
      transport: "ble",
      trigger: "manual",
      outcome: "connected",
      deviceKey: "aerogu34",
    });

    const events = listReconnectEvents(storage);
    expect(
      summarizeReconnects(events, { deviceKey: "aerogu34" }).medianMs,
    ).toBe(4000);
    expect(
      summarizeReconnects(events, {
        since: new Date("2026-07-28T00:30:00Z"),
      }).attempts,
    ).toBe(1);
  });

  it("measures with a timer and only finishes once", () => {
    const storage = memoryStorage();
    let clock = 1_000_000;
    const timer = startReconnectTimer(
      storage,
      { transport: "ble", trigger: "wake", deviceKey: "jisaku_1" },
      () => clock,
    );
    clock += 2345;
    const event = timer.finish("connected");
    expect(event?.durationMs).toBe(2345);
    expect(timer.finish("connected")).toBeNull();
    expect(listReconnectEvents(storage)).toHaveLength(1);
  });

  it("clears the log and survives corrupted data", () => {
    const storage = memoryStorage();
    record(storage, 1000, 0);
    clearReconnectEvents(storage);
    expect(listReconnectEvents(storage)).toHaveLength(0);
    storage.setItem(RECONNECT_STORAGE_KEY, "{broken");
    expect(listReconnectEvents(storage)).toHaveLength(0);
  });

  it("formats durations", () => {
    expect(formatDurationMs(null)).toBe("—");
    expect(formatDurationMs(820)).toBe("820ms");
    expect(formatDurationMs(1800)).toBe("1.8秒");
  });
});
