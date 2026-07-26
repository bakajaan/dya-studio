import {
  DEFAULT_DRILL_WORDS,
  computeCpm,
  computeWpm,
  evaluateTyping,
  pickDrill,
} from "../typingTrainer";

describe("typingTrainer", () => {
  it("evaluates partial input", () => {
    const result = evaluateTyping("abc", "ab");
    expect(result.correctChars).toBe(2);
    expect(result.errorCount).toBe(0);
    expect(result.accuracy).toBe(1);
    expect(result.completed).toBe(false);
  });

  it("counts mistakes", () => {
    const result = evaluateTyping("abc", "axc");
    expect(result.correctChars).toBe(2);
    expect(result.errorCount).toBe(1);
    expect(result.accuracy).toBeCloseTo(2 / 3);
  });

  it("counts overflow as errors", () => {
    const result = evaluateTyping("ab", "abcd");
    expect(result.correctChars).toBe(2);
    expect(result.errorCount).toBe(2);
  });

  it("detects completion", () => {
    expect(evaluateTyping("abc", "abc").completed).toBe(true);
  });

  it("computes wpm and cpm", () => {
    expect(computeWpm(50, 60000)).toBe(10);
    expect(computeWpm(50, 0)).toBe(0);
    expect(computeCpm(120, 60000)).toBe(120);
  });

  it("builds drills from the word pool", () => {
    const drill = pickDrill(DEFAULT_DRILL_WORDS, 3, () => 0);
    expect(drill).toBe("the the the");
    expect(pickDrill([], 3)).toBe("");
    expect(pickDrill(DEFAULT_DRILL_WORDS, 0)).toBe("");
  });
});
