/**
 * Typing trainer scoring (Oryx training-mode parity): pure WPM / accuracy
 * computation and drill text generation.
 */

export interface TypingEvaluation {
  targetLength: number;
  typedLength: number;
  correctChars: number;
  errorCount: number;
  /** Correct chars over typed chars (1 when nothing typed yet). */
  accuracy: number;
  completed: boolean;
}

export function evaluateTyping(target: string, typed: string): TypingEvaluation {
  const typedLength = typed.length;
  let correctChars = 0;
  const comparable = Math.min(target.length, typedLength);
  for (let i = 0; i < comparable; i++) {
    if (typed[i] === target[i]) correctChars++;
  }
  const errorCount = typedLength - correctChars;
  return {
    targetLength: target.length,
    typedLength,
    correctChars,
    errorCount,
    accuracy: typedLength > 0 ? correctChars / typedLength : 1,
    completed: typed === target,
  };
}

/** Standard words-per-minute: 5 correct characters = 1 word. */
export function computeWpm(correctChars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return correctChars / 5 / (elapsedMs / 60000);
}

export function computeCpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return chars / (elapsedMs / 60000);
}

export const DEFAULT_DRILL_WORDS: string[] = [
  "the",
  "quick",
  "brown",
  "fox",
  "jumps",
  "over",
  "lazy",
  "dog",
  "keyboard",
  "firmware",
  "layer",
  "macro",
  "combo",
  "studio",
  "wireless",
  "battery",
  "switch",
  "layout",
  "design",
  "profile",
  "typing",
  "practice",
  "runtime",
  "binding",
  "update",
];

export function pickDrill(
  words: string[],
  count: number,
  random: () => number = Math.random,
): string {
  if (words.length === 0 || count <= 0) return "";
  const picked: string[] = [];
  for (let i = 0; i < count; i++) {
    picked.push(words[Math.floor(random() * words.length) % words.length]);
  }
  return picked.join(" ");
}
