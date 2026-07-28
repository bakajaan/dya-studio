import {
  computeEffortScore,
  defaultEffortsForKeyCount,
  suggestSwaps,
} from "../keymapLayoutSuggestions";

const efforts = [
  { position: 0, effort: 0.9 },
  { position: 1, effort: 0.1 },
  { position: 2, effort: 0.5 },
];

describe("keymapLayoutSuggestions", () => {
  it("computes the effort score", () => {
    const score = computeEffortScore({ "0": 100, "1": 10, "2": 0 }, efforts);
    expect(score).toBeCloseTo(100 * 0.9 + 10 * 0.1, 6);
  });

  it("suggests moving a hot key to an easier position", () => {
    const suggestions = suggestSwaps({
      counts: { "0": 100, "1": 5, "2": 20 },
      efforts,
      labels: { 0: "E", 1: "Q", 2: "R" },
    });
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]).toMatchObject({
      fromPosition: 0,
      toPosition: 1,
      fromLabel: "E",
      toLabel: "Q",
    });
    expect(suggestions[0].saving).toBeCloseTo((100 - 5) * (0.9 - 0.1), 6);
    expect(suggestions[0].savingRatio).toBeGreaterThan(0);
  });

  it("does not reuse a position across suggestions", () => {
    const suggestions = suggestSwaps({
      counts: { "0": 100, "1": 1, "2": 90, "3": 2 },
      efforts: [
        { position: 0, effort: 0.9 },
        { position: 1, effort: 0.1 },
        { position: 2, effort: 0.8 },
        { position: 3, effort: 0.05 },
      ],
      limit: 5,
    });
    const touched = suggestions.flatMap((entry) => [
      entry.fromPosition,
      entry.toPosition,
    ]);
    expect(new Set(touched).size).toBe(touched.length);
  });

  it("returns nothing when the layout is already optimal", () => {
    expect(
      suggestSwaps({
        counts: { "0": 1, "1": 100, "2": 20 },
        efforts,
      }),
    ).toHaveLength(0);
  });

  it("returns nothing without usage data", () => {
    expect(suggestSwaps({ counts: {}, efforts })).toHaveLength(0);
  });

  it("provides default efforts for 34 and 40 key boards", () => {
    const efforts34 = defaultEffortsForKeyCount(34);
    expect(efforts34).toHaveLength(34);
    const efforts40 = defaultEffortsForKeyCount(40);
    expect(efforts40).toHaveLength(40);
    expect(efforts40.map((entry) => entry.position)).toEqual(
      Array.from({ length: 40 }, (_, index) => index),
    );
    // 意図的な空きキーは最も押しにくい扱い
    expect(efforts40.find((entry) => entry.position === 30)?.effort).toBe(1);
    // ホーム行中指は最も楽
    expect(efforts34.find((entry) => entry.position === 12)?.effort).toBe(0.05);
  });
});
