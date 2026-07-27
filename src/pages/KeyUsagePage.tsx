/**
 * 打鍵統計タブ: キーボード自体に保存されている累積打鍵カウンタを表示する。
 *
 * Insightsタブのヒートマップとの違い:
 * - Insights: 「Studioを開いて計測中」の打鍵をこのブラウザに記録 (localStorage)。
 * - このタブ: キーボードのフラッシュに残っている累積値。Studioを開いていない
 *   間の打鍵も含まれ、電源を切っても保持される。
 *
 * 読み出しはボタン押下時のみ行う (マウント即時に自動取得しない)。読み出しは
 * ページング方式 (1ページ12件のRPC応答) なので、タブを開いた瞬間に始めると
 * 他タブの自動取得と競合してBLEが詰まるため。
 */
import { useCallback, useContext, useMemo, useState } from "react";
import {
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconFlame,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import { ConnectionContext } from "../components/DeviceConnection";
import { useKeymap } from "../hooks/useKeymap";
import { useKeyUsage } from "../hooks/useKeyUsage";
import { useLanguage } from "../hooks/useLanguage";
import { heatColor, heatLevel } from "../lib/keyUsageStats";
import {
  HID_USAGE_PAGE_KEYBOARD,
  createHidUsage,
  getKeycodeByCode,
} from "../lib/keycodes";
import type { KeyUsageExportInput } from "../lib/keyUsageExport";
import {
  buildKeyUsageCsv,
  buildKeyUsageJson,
  buildKeyUsageMarkdown,
  copyTextToClipboard,
  downloadTextFile,
  keyUsageExportFilename,
} from "../lib/keyUsageExport";

const HEAT_UNIT = 48;
const TOP_KEYCODE_COUNT = 20;

/**
 * キーマップのバインディングから表示名を推測する。
 * useKeymap の型に依存しすぎないよう、実行時に安全にアクセスする。
 */
function bindingLabel(binding: unknown): string | undefined {
  if (typeof binding !== "object" || binding === null) return undefined;
  const record = binding as { param1?: unknown };
  if (typeof record.param1 !== "number") return undefined;
  const param1 = record.param1;
  if (param1 === 0) return undefined;
  const definition = getKeycodeByCode(param1);
  if (definition) return definition.displayName;
  return `0x${param1.toString(16).toUpperCase()}`;
}

export function KeyUsagePage() {
  const { language } = useLanguage();
  const tr = useCallback(
    (en: string, ja: string) => (language === "ja" ? ja : en),
    [language],
  );
  const connection = useContext(ConnectionContext);
  const keymap = useKeymap();
  const keyUsage = useKeyUsage();

  // "all" = 全レイヤー合計。それ以外はレイヤー番号の文字列。
  const [layerFilter, setLayerFilter] = useState<string>("all");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const activeLayout = useMemo(() => {
    const layouts = keymap.physicalLayouts;
    if (!layouts || layouts.layouts.length === 0) return null;
    return layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
  }, [keymap.physicalLayouts]);

  const positions = keyUsage.stats?.positions ?? [];
  const keycodes = keyUsage.stats?.keycodes ?? [];

  const countsByPosition = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of positions) {
      if (layerFilter !== "all" && entry.layer !== Number(layerFilter)) continue;
      counts.set(entry.position, (counts.get(entry.position) ?? 0) + entry.count);
    }
    return counts;
  }, [positions, layerFilter]);

  const maxPositionCount = useMemo(() => {
    let max = 0;
    countsByPosition.forEach((count) => {
      if (count > max) max = count;
    });
    return max;
  }, [countsByPosition]);

  const layerTotals = useMemo(() => {
    const totals = new Map<number, number>();
    let sum = 0;
    for (const entry of positions) {
      totals.set(entry.layer, (totals.get(entry.layer) ?? 0) + entry.count);
      sum += entry.count;
    }
    return Array.from(totals.entries())
      .map(([layerIndex, count]) => ({
        layerIndex,
        count,
        share: sum > 0 ? count / sum : 0,
      }))
      .sort((a, b) => a.layerIndex - b.layerIndex);
  }, [positions]);

  const topKeycodes = useMemo(() => {
    return [...keycodes]
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_KEYCODE_COUNT);
  }, [keycodes]);

  const keycodeTotal = useMemo(
    () => keycodes.reduce((sum, entry) => sum + entry.count, 0),
    [keycodes],
  );

  const heatmapGeometry = useMemo(() => {
    if (!activeLayout || activeLayout.keys.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const key of activeLayout.keys) {
      minX = Math.min(minX, key.x / 100);
      minY = Math.min(minY, key.y / 100);
      maxX = Math.max(maxX, key.x / 100 + key.width / 100);
      maxY = Math.max(maxY, key.y / 100 + key.height / 100);
    }
    return {
      minX,
      minY,
      width: (maxX - minX) * HEAT_UNIT,
      height: (maxY - minY) * HEAT_UNIT,
    };
  }, [activeLayout]);

  const keycodeLabel = useCallback((usagePage: number, keycode: number) => {
    const definition =
      usagePage === HID_USAGE_PAGE_KEYBOARD || usagePage === 0
        ? getKeycodeByCode(keycode)
        : getKeycodeByCode(createHidUsage(usagePage, keycode));
    if (definition) return definition.displayName;
    return `0x${keycode.toString(16).toUpperCase()}`;
  }, []);

  const layerNames = useMemo(() => {
    const layers = keymap.keymap?.layers ?? [];
    return layers.map((layer, index) => layer?.name || `Layer ${index}`);
  }, [keymap.keymap]);

  const keyGeometry = useMemo(() => {
    if (!activeLayout) return undefined;
    return activeLayout.keys.map((key) => ({
      x: key.x / 100,
      y: key.y / 100,
      width: key.width / 100,
      height: key.height / 100,
    }));
  }, [activeLayout]);

  const keyBindings = useMemo(() => {
    const layers = (keymap.keymap?.layers ?? []) as unknown[];
    return layers.map((layer) => {
      const bindings = (layer as { bindings?: unknown }).bindings;
      if (!Array.isArray(bindings)) return [] as (string | undefined)[];
      return bindings.map((binding) => bindingLabel(binding));
    });
  }, [keymap.keymap]);

  const buildExportInput = useCallback((): KeyUsageExportInput | null => {
    const stats = keyUsage.stats;
    if (!stats) return null;
    return {
      metadata: stats.metadata,
      fetchedAt: stats.fetchedAt,
      positions: stats.positions,
      keycodes: stats.keycodes,
      layerNames,
      keyGeometry,
      keyBindings,
      keycodeLabel,
    };
  }, [keyUsage.stats, layerNames, keyGeometry, keyBindings, keycodeLabel]);

  const handleDownloadJson = useCallback(() => {
    const input = buildExportInput();
    if (!input) return;
    downloadTextFile(
      keyUsageExportFilename("json", input.fetchedAt),
      buildKeyUsageJson(input),
      "application/json",
    );
  }, [buildExportInput]);

  const handleDownloadCsv = useCallback(() => {
    const input = buildExportInput();
    if (!input) return;
    downloadTextFile(
      keyUsageExportFilename("csv", input.fetchedAt),
      buildKeyUsageCsv(input),
      "text/csv",
    );
  }, [buildExportInput]);

  const handleDownloadMarkdown = useCallback(() => {
    const input = buildExportInput();
    if (!input) return;
    downloadTextFile(
      keyUsageExportFilename("md", input.fetchedAt),
      buildKeyUsageMarkdown(input),
      "text/markdown",
    );
  }, [buildExportInput]);

  const handleCopyMarkdown = useCallback(async () => {
    const input = buildExportInput();
    if (!input) return;
    const copied = await copyTextToClipboard(buildKeyUsageMarkdown(input));
    setCopyState(copied ? "copied" : "failed");
    window.setTimeout(() => setCopyState("idle"), 2500);
  }, [buildExportInput]);

  const handleClear = useCallback(() => {
    const confirmed = window.confirm(
      tr(
        "Clear every key usage counter stored on the keyboard? This cannot be undone.",
        "キーボードに保存されている打鍵カウンタをすべて消去しますか？この操作は取り消せません。",
      ),
    );
    if (!confirmed) return;
    void keyUsage.clearStats();
  }, [keyUsage, tr]);

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
            <IconFlame size={24} className="text-[var(--color-electric)]" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-[var(--color-text)]">
              {tr("Key usage", "打鍵統計")}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {tr(
                "Cumulative counters stored on the keyboard itself (kept across reboots)",
                "キーボード自体に保存された累積カウンタ（再起動しても保持）",
              )}
            </p>
          </div>
        </div>

        {!connection.isConnected && (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {tr(
                "Connect your keyboard to read the stored key usage counters",
                "保存された打鍵カウンタを読み出すにはキーボードを接続してください",
              )}
            </p>
          </div>
        )}

        {connection.isConnected && !keyUsage.isAvailable && (
          <div className="glass-card p-6">
            <p className="text-sm text-[var(--color-text-muted)]">
              {tr(
                "This firmware does not include the key usage module (zmk-feature-key-usage). Rebuild the firmware with CONFIG_ZMK_KEY_USAGE=y to record counters on the keyboard.",
                "このファームウェアには打鍵統計モジュール (zmk-feature-key-usage) が入っていません。CONFIG_ZMK_KEY_USAGE=y でファームをビルドし直してください。",
              )}
            </p>
          </div>
        )}

        {connection.isConnected && keyUsage.isAvailable && (
          <div className="space-y-4">
            <section className="glass-card p-4">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Stored on the keyboard", "キーボードの累積記録")}
                </h2>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <button
                    className="btn-electric text-sm flex items-center gap-1.5"
                    onClick={() => void keyUsage.fetchStats()}
                    disabled={keyUsage.isLoading || keyUsage.isMutating}
                  >
                    <IconRefresh size={16} />
                    {keyUsage.isLoading
                      ? tr("Reading...", "読み出し中...")
                      : tr("Read from keyboard", "キーボードから読み出す")}
                  </button>
                  <button
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={() => void keyUsage.saveStats()}
                    disabled={keyUsage.isLoading || keyUsage.isMutating}
                    title={tr(
                      "Flush the counters to flash right now (they are also saved automatically every few minutes).",
                      "カウンタを今すぐフラッシュに書き込みます（通常は数分ごとに自動保存されます）。",
                    )}
                  >
                    <IconDeviceFloppy size={16} />
                    {tr("Save now", "今すぐ保存")}
                  </button>
                  <button
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={handleClear}
                    disabled={keyUsage.isLoading || keyUsage.isMutating}
                  >
                    <IconTrash size={16} />
                    {tr("Clear on keyboard", "キーボード上を消去")}
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--color-text-muted)]">
                {tr(
                  "Counters keep running even when DYA Studio is closed. Reading them can take a few seconds over Bluetooth.",
                  "DYA Studioを開いていない間もカウンタは加算されます。Bluetooth接続では読み出しに数秒かかることがあります。",
                )}
              </p>

              {keyUsage.error && (
                <p className="text-sm text-red-400 mt-2">{keyUsage.error}</p>
              )}

              {keyUsage.stats && (
                <div className="flex flex-wrap gap-4 mt-3 text-sm text-[var(--color-text-secondary)]">
                  <span>
                    {tr("Total presses", "総打鍵数")}:{" "}
                    <span className="text-[var(--color-electric)] font-medium">
                      {keyUsage.stats.metadata.totalPresses}
                    </span>
                  </span>
                  <span>
                    {tr("Tracked keys", "記録されたキー")}: {positions.length}
                  </span>
                  <span>
                    {tr("Read at", "読み出し時刻")}:{" "}
                    {new Date(keyUsage.stats.fetchedAt).toLocaleString()}
                  </span>
                </div>
              )}

              {!keyUsage.stats && !keyUsage.isLoading && (
                <p className="text-sm text-[var(--color-text-muted)] mt-3">
                  {tr(
                    "Press “Read from keyboard” to load the stored counters.",
                    "「キーボードから読み出す」を押すと保存済みのカウンタを取得します。",
                  )}
                </p>
              )}
            </section>

            {keyUsage.stats && (
              <section className="glass-card p-4">
                <h2 className="text-sm font-medium text-[var(--color-text)] mb-2">
                  {tr("Export for analysis", "分析用にデータ出力")}
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {tr(
                    "Export the counters together with the layer names, key positions and the keys currently assigned there. Paste the AI text into ChatGPT / Claude and ask it to review your keymap, or open the CSV in a spreadsheet.",
                    "レイヤー名・キー位置・そこに割り当てられているキーを含めて書き出します。「AI用テキスト」をChatGPTやClaudeに貼り付ければキーマップの分析を頼めます。CSVは表計算ソフトで開けます。",
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="btn-electric text-sm flex items-center gap-1.5"
                    onClick={() => void handleCopyMarkdown()}
                  >
                    <IconCopy size={16} />
                    {copyState === "copied"
                      ? tr("Copied", "コピーしました")
                      : copyState === "failed"
                        ? tr("Copy failed", "コピーに失敗")
                        : tr("Copy AI text", "AI用テキストをコピー")}
                  </button>
                  <button
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={handleDownloadMarkdown}
                  >
                    <IconDownload size={16} />
                    {tr("Markdown (.md)", "Markdown (.md)")}
                  </button>
                  <button
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={handleDownloadJson}
                  >
                    <IconDownload size={16} />
                    {tr("JSON (.json)", "JSON (.json)")}
                  </button>
                  <button
                    className="btn-ghost text-sm flex items-center gap-1.5"
                    onClick={handleDownloadCsv}
                  >
                    <IconDownload size={16} />
                    {tr("CSV (.csv)", "CSV (.csv)")}
                  </button>
                </div>
                {copyState === "failed" && (
                  <p className="text-xs text-red-400 mt-2">
                    {tr(
                      "The browser blocked clipboard access. Use the Markdown download instead.",
                      "ブラウザにクリップボードへのアクセスを拒否されました。代わりにMarkdownのダウンロードをお使いください。",
                    )}
                  </p>
                )}
                {keyBindings.length === 0 && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-2">
                    {tr(
                      "Open the Keymap tab once so the assigned keys can be included in the export.",
                      "キーマップタブを一度開くと、各キーに割り当てられているキーも一緒に書き出せます。",
                    )}
                  </p>
                )}
              </section>
            )}

            {keyUsage.stats && (
              <section className="glass-card p-4">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h2 className="text-sm font-medium text-[var(--color-text)]">
                    {tr("Heatmap", "ヒートマップ")}
                  </h2>
                  <select
                    value={layerFilter}
                    onChange={(event) => setLayerFilter(event.target.value)}
                    className="ml-auto px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
                  >
                    <option value="all">
                      {tr("All layers", "全レイヤー合計")}
                    </option>
                    {layerTotals.map(({ layerIndex }) => (
                      <option key={layerIndex} value={String(layerIndex)}>
                        {keymap.keymap?.layers[layerIndex]?.name ||
                          `Layer ${layerIndex}`}
                      </option>
                    ))}
                  </select>
                </div>

                {!activeLayout && (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {tr(
                      "The physical layout has not been loaded yet, so the heatmap cannot be drawn. The rankings below still work.",
                      "物理レイアウトがまだ読み込まれていないためヒートマップを描画できません。下のランキングは表示できます。",
                    )}
                  </p>
                )}

                {activeLayout && heatmapGeometry && (
                  <svg
                    viewBox={`0 0 ${heatmapGeometry.width} ${heatmapGeometry.height}`}
                    className="w-full max-w-3xl"
                  >
                    {activeLayout.keys.map((key, position) => {
                      const x = (key.x / 100 - heatmapGeometry.minX) * HEAT_UNIT;
                      const y = (key.y / 100 - heatmapGeometry.minY) * HEAT_UNIT;
                      const w = (key.width / 100) * HEAT_UNIT;
                      const h = (key.height / 100) * HEAT_UNIT;
                      const count = countsByPosition.get(position) ?? 0;
                      const rotation = key.r
                        ? `rotate(${key.r / 100} ${(key.rx / 100 - heatmapGeometry.minX) * HEAT_UNIT} ${(key.ry / 100 - heatmapGeometry.minY) * HEAT_UNIT})`
                        : undefined;
                      return (
                        <g key={position} transform={rotation}>
                          <rect
                            x={x + 1.5}
                            y={y + 1.5}
                            width={w - 3}
                            height={h - 3}
                            rx={5}
                            fill={heatColor(heatLevel(count, maxPositionCount))}
                            stroke="var(--color-border)"
                            strokeWidth={1}
                          />
                          {count > 0 && (
                            <text
                              x={x + w / 2}
                              y={y + h / 2}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={HEAT_UNIT * 0.26}
                              fill="var(--color-text)"
                            >
                              {count}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </section>
            )}

            {keyUsage.stats && (
              <section className="glass-card p-4">
                <div className="grid grid-cols-1 tablet:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                      {tr("Layer usage", "レイヤー使用率")}
                    </h3>
                    {layerTotals.length === 0 && (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {tr("No data yet.", "まだデータがありません。")}
                      </p>
                    )}
                    <div className="space-y-1.5">
                      {layerTotals.map(({ layerIndex, count, share }) => (
                        <div
                          key={layerIndex}
                          className="flex items-center gap-2"
                        >
                          <span className="text-xs w-24 truncate text-[var(--color-text-secondary)]">
                            {keymap.keymap?.layers[layerIndex]?.name ||
                              `Layer ${layerIndex}`}
                          </span>
                          <div className="flex-1 h-2 rounded bg-[var(--color-border)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-electric)]"
                              style={{ width: `${Math.round(share * 100)}%` }}
                            />
                          </div>
                          <span className="text-xs w-20 text-right text-[var(--color-text-muted)]">
                            {count} ({Math.round(share * 100)}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                      {tr("Most typed keys", "よく打っているキー")}
                    </h3>
                    {topKeycodes.length === 0 && (
                      <p className="text-sm text-[var(--color-text-muted)]">
                        {tr(
                          "No keycode data. Keycode tracking requires CONFIG_ZMK_KEY_USAGE_TRACK_KEYCODES=y.",
                          "キーコード別のデータがありません。CONFIG_ZMK_KEY_USAGE_TRACK_KEYCODES=y が必要です。",
                        )}
                      </p>
                    )}
                    <ol className="space-y-1">
                      {topKeycodes.map((entry) => (
                        <li
                          key={`${entry.usagePage}:${entry.keycode}`}
                          className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
                        >
                          <span className="px-1.5 py-0.5 rounded bg-[var(--color-border)] font-mono text-xs min-w-[2.5rem] text-center">
                            {keycodeLabel(entry.usagePage, entry.keycode)}
                          </span>
                          <div className="flex-1 h-2 rounded bg-[var(--color-border)] overflow-hidden">
                            <div
                              className="h-full bg-[var(--color-electric)]"
                              style={{
                                width: `${
                                  topKeycodes[0].count > 0
                                    ? Math.round(
                                        (entry.count / topKeycodes[0].count) *
                                          100,
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <span className="text-xs w-20 text-right text-[var(--color-text-muted)]">
                            {entry.count}
                            {keycodeTotal > 0 &&
                              ` (${Math.round((entry.count / keycodeTotal) * 100)}%)`}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
