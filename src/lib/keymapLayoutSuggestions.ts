/**
 * 打鍵ヒートマップから「このキーはもっと押しやすい位置に置ける」という
 * 配列改善サジェストを作る。keyUsageStats の集計結果を入力に、
 * 位置ごとの「押しにくさ（effort）」との組み合わせで評価する。
 *
 * 考え方はシンプルで、コスト = Σ(打鍵回数 × effort)。
 * このコストを下げる入れ替え（多いキーを楽な位置へ）を貪欲法で列挙する。
 * 自動で書き換えはせず、あくまで提案として表示するためのロジック。
 */

export interface PositionEffort {
  position: number;
  /** 0 = 非常に押しやすい ～ 1 = 押しにくい */
  effort: number;
}

export interface SwapSuggestion {
  /** 打鍵が多いのに押しにくい位置 */
  fromPosition: number;
  /** 打鍵が少ないのに押しやすい位置 */
  toPosition: number;
  fromLabel: string;
  toLabel: string;
  fromCount: number;
  toCount: number;
  /** 入れ替えで減るコスト（大きいほど効果大） */
  saving: number;
  /** 全体コストに対する削減率 0～1 */
  savingRatio: number;
}

export interface SuggestionInput {
  /** keyUsageStats.countsByPosition 相当 */
  counts: Record<string, number>;
  efforts: PositionEffort[];
  /** 位置 -> 表示ラベル（無ければ "#12" のように表示） */
  labels?: Record<number, string>;
  /** 提案の上限件数 */
  limit?: number;
  /** これ未満の打鍵回数のキーは「多い側」の候補にしない */
  minCount?: number;
  /** これ未満の削減率の提案は捨てる */
  minSavingRatio?: number;
}

function labelFor(
  position: number,
  labels: Record<number, string> | undefined,
): string {
  const label = labels?.[position];
  return label && label.trim().length > 0 ? label : `#${position}`;
}

/** Σ(打鍵回数 × effort)。小さいほど楽な配列。 */
export function computeEffortScore(
  counts: Record<string, number>,
  efforts: readonly PositionEffort[],
): number {
  let score = 0;
  for (const { position, effort } of efforts) {
    score += (counts[String(position)] ?? 0) * effort;
  }
  return score;
}

/**
 * 入れ替え候補を貪欲法で列挙する。
 * 同じ位置が複数の提案に登場しないように使用済み位置を除外していくので、
 * 上から順にそのまま適用しても矛盾しない。
 */
export function suggestSwaps(input: SuggestionInput): SwapSuggestion[] {
  const {
    counts,
    efforts,
    labels,
    limit = 5,
    minCount = 1,
    minSavingRatio = 0.005,
  } = input;

  const totalScore = computeEffortScore(counts, efforts);
  if (totalScore <= 0) return [];

  const entries = efforts.map(({ position, effort }) => ({
    position,
    effort,
    count: counts[String(position)] ?? 0,
  }));

  const used = new Set<number>();
  const suggestions: SwapSuggestion[] = [];

  // 打鍵が多い順に見ていき、より楽な位置の中で削減効果が最大の相手を探す。
  const byCountDesc = [...entries].sort(
    (a, b) => b.count - a.count || a.position - b.position,
  );

  for (const hot of byCountDesc) {
    if (suggestions.length >= limit) break;
    if (hot.count < minCount) break;
    if (used.has(hot.position)) continue;

    let best: { entry: (typeof entries)[number]; saving: number } | null = null;
    for (const candidate of entries) {
      if (candidate.position === hot.position) continue;
      if (used.has(candidate.position)) continue;
      // 入れ替えによるコスト差分
      const saving =
        (hot.count - candidate.count) * (hot.effort - candidate.effort);
      if (saving <= 0) continue;
      if (!best || saving > best.saving) best = { entry: candidate, saving };
    }

    if (!best) continue;
    const savingRatio = best.saving / totalScore;
    if (savingRatio < minSavingRatio) continue;

    used.add(hot.position);
    used.add(best.entry.position);
    suggestions.push({
      fromPosition: hot.position,
      toPosition: best.entry.position,
      fromLabel: labelFor(hot.position, labels),
      toLabel: labelFor(best.entry.position, labels),
      fromCount: hot.count,
      toCount: best.entry.count,
      saving: best.saving,
      savingRatio,
    });
  }

  return suggestions.sort((a, b) => b.saving - a.saving);
}

/**
 * 34キー統一レイアウト（上3段×10列 + 親指 4キー）の既定 effort。
 * ホーム行を最も楽とし、上下段・小指・中央列へ行くほど大きくする。
 */
export function defaultEfforts34(): PositionEffort[] {
  // 列ごとの基本コスト（左手小指側→中央→右手小指側）
  const columnEffort = [0.35, 0.15, 0.05, 0.1, 0.4, 0.4, 0.1, 0.05, 0.15, 0.35];
  // 行ごとの加算（上段 / ホーム / 下段）
  const rowEffort = [0.35, 0, 0.4];

  const efforts: PositionEffort[] = [];
  for (let row = 0; row < 3; row += 1) {
    for (let column = 0; column < 10; column += 1) {
      efforts.push({
        position: row * 10 + column,
        effort: Math.min(1, columnEffort[column] + rowEffort[row]),
      });
    }
  }
  // 親指 4 キー（位置 30～33）
  [0.2, 0.1, 0.1, 0.2].forEach((effort, index) => {
    efforts.push({ position: 30 + index, effort });
  });
  return efforts;
}

/**
 * 40キー版（jisaku_1）の既定 effort。
 * 位置 0～29 は 34キー版と共通、位置 33～36 が親指キー、
 * 30～32 / 37〜39 は意図的な空きキー（effort = 1）とする。
 */
export function defaultEfforts40(): PositionEffort[] {
  const base = defaultEfforts34();
  const efforts: PositionEffort[] = base
    .filter((entry) => entry.position <= 29)
    .map((entry) => ({ ...entry }));
  for (const position of [30, 31, 32, 37, 38, 39]) {
    efforts.push({ position, effort: 1 });
  }
  base
    .filter((entry) => entry.position >= 30)
    .forEach((entry, index) => {
      efforts.push({ position: 33 + index, effort: entry.effort });
    });
  return efforts.sort((a, b) => a.position - b.position);
}

/** キー数から既定 effort を選ぶ。不明な場合は一律 0.3。 */
export function defaultEffortsForKeyCount(keyCount: number): PositionEffort[] {
  if (keyCount === 34) return defaultEfforts34();
  if (keyCount === 40) return defaultEfforts40();
  return Array.from({ length: Math.max(0, keyCount) }, (_, position) => ({
    position,
    effort: 0.3,
  }));
}
