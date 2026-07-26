import {
  KEY_USAGE_STORAGE_KEY,
  clearStats,
  createEmptyStats,
  heatColor,
  heatLevel,
  layerShares,
  loadStats,
  maxPositionCount,
  recordKeyPress,
  saveStats,
  topPositions,
} from "../keyUsageStats";

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

describe("keyUsageStats", () => {
  it("records presses per position and per layer", () => {
    let stats = createEmptyStats(new Date("2026-01-01T00:00:00Z"));
    stats = recordKeyPress(stats, 3, 0);
    stats = recordKeyPress(stats, 3, 1);
    stats = recordKeyPress(stats, 7, 1);
    expect(stats.totalPresses).toBe(3);
    expect(stats.countsByPosition["3"]).toBe(2);
    expect(stats.countsByPosition["7"]).toBe(1);
    expect(stats.countsByLayer["1"]).toBe(2);
    expect(maxPositionCount(stats)).toBe(2);
  });

  it("computes heat levels and colors", () => {
    expect(heatLevel(0, 10)).toBe(0);
    expect(heatLevel(5, 10)).toBe(0.5);
    expect(heatLevel(20, 10)).toBe(1);
    expect(heatColor(0)).toContain("rgba");
    expect(heatColor(1)).toContain("hsla(0");
  });

  it("ranks top positions and layer shares", () => {
    let stats = createEmptyStats();
    stats = recordKeyPress(stats, 1, 0);
    stats = recordKeyPress(stats, 1, 0);
    stats = recordKeyPress(stats, 2, 1);
    const top = topPositions(stats, 1);
    expect(top).toEqual([{ position: 1, count: 2 }]);
    const shares = layerShares(stats);
    expect(shares[0]).toEqual({ layerIndex: 0, count: 2, share: 2 / 3 });
  });

  it("round-trips through storage and clears", () => {
    const storage = memoryStorage();
    let stats = createEmptyStats();
    stats = recordKeyPress(stats, 1, 0);
    saveStats(storage, stats);
    expect(loadStats(storage).totalPresses).toBe(1);
    const cleared = clearStats(storage);
    expect(cleared.totalPresses).toBe(0);
    expect(storage.data.has(KEY_USAGE_STORAGE_KEY)).toBe(false);
  });

  it("returns empty stats for corrupted data", () => {
    const storage = memoryStorage();
    storage.setItem(KEY_USAGE_STORAGE_KEY, "{broken");
    expect(loadStats(storage).totalPresses).toBe(0);
  });
});
