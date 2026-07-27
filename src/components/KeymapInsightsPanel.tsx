import { useCallback, useMemo, useState } from "react";
import {
  IconChartBar,
  IconCopy,
  IconDeviceFloppy,
  IconDownload,
  IconRefresh,
  IconTrash,
} from "@tabler/icons-react";
import type {
  BehaviorBinding,
  BehaviorDefinition,
  Layer,
  PhysicalLayout,
} from "../hooks/useKeymap";
import { useKeyUsage } from "../hooks/useKeyUsage";
import { useLiveKeyUsageStats } from "../hooks/useLiveKeyUsageStats";
import type { KeyboardLayoutType } from "../lib/keyboardLayouts";
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
import {
  buildKeycodeUsageMap,
  computePredictedCountsByPosition,
  maxOfCounts,
  type PredictionScope,
} from "../lib/keymapUsagePrediction";
import { formatComboBehavior } from "./macroCombo/comboUtils";
import { KeyUsageHeatmapSvg } from "./KeyUsageHeatmapSvg";

type InsightsTab = "live" | "device" | "prediction";

const TOP_KEYCODE_COUNT = 8;

/**
 * Sidebar panel shown next to the keymap editor (see KeymapPage) so the user
 * can watch the heatmap / key usage / a frequency prediction for the layout
 * they're currently editing, all without switching tabs.
 *
 * This panel absorbs what used to be the standalone "Key Usage" tab: the
 * "Device" tab below has the same read / save / clear / export actions and
 * rankings, just scoped to sit next to the editor instead of on its own page.
 *
 * - "Live" tab: presses recorded in this browser while Stream is on (shared
 *   with the Insights tab's heatmap via useLiveKeyUsageStats).
 * - "Device" tab: cumulative counters stored on the keyboard itself.
 * - "Prediction" tab: projects the device's per-keycode press history onto
 *   the CURRENT (possibly unsaved) key bindings, so reassigning a key
 *   updates the estimated heatmap immediately — see keymapUsagePrediction.ts
 *   for the approximation this relies on.
 */
export function KeymapInsightsPanel({
  activeLayout,
  layers,
  layersForSelector,
  behaviors,
  keyboardLayout,
  runtimeMacros,
  highlightedKeys,
  activeLayerIndex,
  isStreamEnabled,
  t,
  tr,
}: {
  activeLayout: PhysicalLayout | null;
  layers: Layer[];
  layersForSelector: Array<{ id: number; name: string }>;
  behaviors: Map<number, BehaviorDefinition>;
  keyboardLayout: KeyboardLayoutType;
  runtimeMacros: Array<{ slot: number; name?: string }>;
  highlightedKeys: ReadonlySet<number>;
  activeLayerIndex: number | null;
  isStreamEnabled: boolean;
  t: (key: string, params?: Record<string, number | string>) => string;
  tr: (en: string, ja: string) => string;
}) {
  const [tab, setTab] = useState<InsightsTab>("live");
  const [deviceLayerFilter, setDeviceLayerFilter] = useState<string>("all");
  const [predictionScope, setPredictionScope] = useState<string>("all");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const live = useLiveKeyUsageStats(
    highlightedKeys,
    activeLayerIndex,
    isStreamEnabled,
  );
  const deviceUsage = useKeyUsage();

  const labelForBinding = (layerIndex: number, position: number): string => {
    const binding: BehaviorBinding | undefined =
      layers[layerIndex]?.bindings[position];
    if (!binding) return "";
    return formatComboBehavior(
      binding,
      behaviors,
      layersForSelector,
      keyboardLayout,
      runtimeMacros,
      t,
    );
  };

  const devicePositions = deviceUsage.stats?.positions ?? [];
  const deviceKeycodes = deviceUsage.stats?.keycodes ?? [];

  const deviceCountsByPosition = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of devicePositions) {
      if (
        deviceLayerFilter !== "all" &&
        entry.layer !== Number(deviceLayerFilter)
      )
        continue;
      counts.set(
        entry.position,
        (counts.get(entry.position) ?? 0) + entry.count,
      );
    }
    return counts;
  }, [devicePositions, deviceLayerFilter]);
  const deviceMaxCount = useMemo(
    () => maxOfCounts(deviceCountsByPosition),
    [deviceCountsByPosition],
  );

  const deviceLayerTotals = useMemo(() => {
    const totals = new Map<number, number>();
    let sum = 0;
    for (const entry of devicePositions) {
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
  }, [devicePositions]);

  const topKeycodes = useMemo(
    () =>
      [...deviceKeycodes]
        .sort((a, b) => b.count - a.count)
        .slice(0, TOP_KEYCODE_COUNT),
    [deviceKeycodes],
  );
  const keycodeTotal = useMemo(
    () => deviceKeycodes.reduce((sum, entry) => sum + entry.count, 0),
    [deviceKeycodes],
  );

  const keycodeLabel = useCallback((usagePage: number, keycode: number) => {
    const definition =
      usagePage === HID_USAGE_PAGE_KEYBOARD || usagePage === 0
        ? getKeycodeByCode(keycode)
        : getKeycodeByCode(createHidUsage(usagePage, keycode));
    if (definition) return definition.displayName;
    return `0x${keycode.toString(16).toUpperCase()}`;
  }, []);

  const layerNames = useMemo(
    () => layers.map((layer, index) => layer.name || `Layer ${index}`),
    [layers],
  );

  const keyGeometry = useMemo(() => {
    if (!activeLayout) return undefined;
    return activeLayout.keys.map((key) => ({
      x: key.x / 100,
      y: key.y / 100,
      width: key.width / 100,
      height: key.height / 100,
    }));
  }, [activeLayout]);

  const buildExportInput = useCallback((): KeyUsageExportInput | null => {
    const stats = deviceUsage.stats;
    if (!stats) return null;
    const keyBindings = layers.map((layer, layerIndex) =>
      layer.bindings.map(
        (_, position) => labelForBinding(layerIndex, position) || undefined,
      ),
    );
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceUsage.stats, layers, layerNames, keyGeometry, keycodeLabel]);

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
    void deviceUsage.clearStats();
  }, [deviceUsage, tr]);

  // --- Prediction tab -------------------------------------------------
  const keycodeUsageMap = useMemo(
    () => buildKeycodeUsageMap(deviceKeycodes),
    [deviceKeycodes],
  );
  const predictionScopeValue: PredictionScope =
    predictionScope === "all" ? "all" : Number(predictionScope);
  const predictedCountsByPosition = useMemo(
    () =>
      computePredictedCountsByPosition(
        layers,
        behaviors,
        keycodeUsageMap,
        predictionScopeValue,
      ),
    [layers, behaviors, keycodeUsageMap, predictionScopeValue],
  );
  const predictedMaxCount = useMemo(
    () => maxOfCounts(predictedCountsByPosition),
    [predictedCountsByPosition],
  );
  const predictedTotal = useMemo(() => {
    let sum = 0;
    predictedCountsByPosition.forEach((count) => {
      sum += count;
    });
    return sum;
  }, [predictedCountsByPosition]);
  const predictionLabelLayerIndex =
    predictionScopeValue === "all" ? 0 : predictionScopeValue;
  const topPredictedKeys = useMemo(() => {
    return Array.from(predictedCountsByPosition.entries())
      .map(([position, count]) => ({ position, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [predictedCountsByPosition]);

  return (
    <aside className="glass-card p-4 max-h-[calc(100vh-3rem)] overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <IconChartBar size={18} className="text-[var(--color-electric)]" />
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          {tr("Insights", "インサイト")}
        </h2>
      </div>

      <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] w-fit flex-wrap">
        <button
          type="button"
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            tab === "live"
              ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          onClick={() => setTab("live")}
        >
          {tr("Live", "ライブ")}
        </button>
        <button
          type="button"
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            tab === "device"
              ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          onClick={() => setTab("device")}
        >
          {tr("On device", "デバイス上")}
        </button>
        <button
          type="button"
          className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
            tab === "prediction"
              ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
          }`}
          onClick={() => setTab("prediction")}
        >
          {tr("Prediction", "予測")}
        </button>
      </div>

      {tab === "live" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            {isStreamEnabled
              ? tr(
                  "Recording presses while Stream is on (stored locally in this browser).",
                  "ストリームが有効な間の打鍵を記録しています（このブラウザのローカルに保存）。",
                )
              : tr(
                  "Turn on the Stream toggle to record presses live while you edit.",
                  "ストリームを有効にすると、編集中の打鍵をライブで記録できます。",
                )}
          </p>
          {activeLayout && (
            <KeyUsageHeatmapSvg
              layout={activeLayout}
              getCount={(position) =>
                live.stats.countsByPosition[String(position)] ?? 0
              }
              maxCount={live.maxCount}
            />
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--color-text-muted)]">
              {tr("Total presses", "総打鍵数")}: {live.stats.totalPresses}
            </span>
            <button
              type="button"
              className="btn-ghost text-xs flex items-center gap-1"
              onClick={live.resetStats}
              disabled={live.stats.totalPresses === 0}
            >
              <IconRefresh size={13} />
              {tr("Reset", "リセット")}
            </button>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
              {tr("Layer usage", "レイヤー使用率")}
            </h3>
            {live.shares.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {tr("No data yet.", "まだデータがありません。")}
              </p>
            )}
            <div className="space-y-1">
              {live.shares.map(({ layerIndex, count, share }) => (
                <div key={layerIndex} className="flex items-center gap-2">
                  <span className="text-xs w-16 truncate text-[var(--color-text-secondary)]">
                    {layers[layerIndex]?.name || `Layer ${layerIndex}`}
                  </span>
                  <div className="flex-1 h-1.5 rounded bg-[var(--color-border)] overflow-hidden">
                    <div
                      className="h-full bg-[var(--color-electric)]"
                      style={{ width: `${Math.round(share * 100)}%` }}
                    />
                  </div>
                  <span className="text-xs w-8 text-right text-[var(--color-text-muted)]">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
              {tr("Top keys", "打鍵の多いキー")}
            </h3>
            {live.topKeys.length === 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {tr("No data yet.", "まだデータがありません。")}
              </p>
            )}
            <ol className="space-y-1">
              {live.topKeys.map(({ position, count }) => (
                <li
                  key={position}
                  className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2"
                >
                  <span className="font-mono text-[var(--color-text-muted)]">
                    #{position}
                  </span>
                  <span className="flex-1 truncate">
                    {labelForBinding(activeLayerIndex ?? 0, position) || "—"}
                  </span>
                  <span className="text-[var(--color-text-muted)]">
                    {count}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {tab === "device" && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            {tr(
              "Cumulative counters stored on the keyboard itself (kept across reboots).",
              "キーボード自体に保存された累積カウンタです（再起動しても保持）。",
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-electric text-xs flex items-center gap-1"
              onClick={() => void deviceUsage.fetchStats()}
              disabled={
                !deviceUsage.isAvailable ||
                deviceUsage.isLoading ||
                deviceUsage.isMutating
              }
            >
              <IconRefresh size={13} />
              {deviceUsage.isLoading
                ? tr("Reading...", "読み出し中...")
                : tr("Read from keyboard", "キーボードから読み出す")}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs flex items-center gap-1"
              onClick={() => void deviceUsage.saveStats()}
              disabled={
                !deviceUsage.isAvailable ||
                deviceUsage.isLoading ||
                deviceUsage.isMutating
              }
              title={tr(
                "Flush the counters to flash right now (they are also saved automatically every few minutes).",
                "カウンタを今すぐフラッシュに書き込みます（通常は数分ごとに自動保存されます）。",
              )}
            >
              <IconDeviceFloppy size={13} />
              {tr("Save now", "今すぐ保存")}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs flex items-center gap-1"
              onClick={handleClear}
              disabled={
                !deviceUsage.isAvailable ||
                deviceUsage.isLoading ||
                deviceUsage.isMutating
              }
            >
              <IconTrash size={13} />
              {tr("Clear on keyboard", "キーボード上を消去")}
            </button>
          </div>

          {!deviceUsage.isAvailable && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {tr(
                "This firmware does not include the key usage module.",
                "このファームウェアには打鍵統計モジュールが入っていません。",
              )}
            </p>
          )}
          {deviceUsage.error && (
            <p className="text-xs text-red-400">{deviceUsage.error}</p>
          )}

          {deviceUsage.stats && (
            <>
              <div className="flex flex-wrap gap-3 text-xs text-[var(--color-text-secondary)]">
                <span>
                  {tr("Total presses", "総打鍵数")}:{" "}
                  <span className="text-[var(--color-electric)] font-medium">
                    {deviceUsage.stats.metadata.totalPresses}
                  </span>
                </span>
                <span>
                  {tr("Read at", "読み出し時刻")}:{" "}
                  {new Date(deviceUsage.stats.fetchedAt).toLocaleTimeString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--color-text-muted)]">
                  {tr("Heatmap layer", "ヒートマップのレイヤー")}:
                </span>
                <select
                  value={deviceLayerFilter}
                  onChange={(event) =>
                    setDeviceLayerFilter(event.target.value)
                  }
                  className="px-2 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)]"
                >
                  <option value="all">
                    {tr("All layers", "全レイヤー合計")}
                  </option>
                  {deviceLayerTotals.map(({ layerIndex }) => (
                    <option key={layerIndex} value={String(layerIndex)}>
                      {layerNames[layerIndex] || `Layer ${layerIndex}`}
                    </option>
                  ))}
                </select>
              </div>

              {activeLayout && (
                <KeyUsageHeatmapSvg
                  layout={activeLayout}
                  getCount={(position) =>
                    deviceCountsByPosition.get(position) ?? 0
                  }
                  maxCount={deviceMaxCount}
                />
              )}

              <div>
                <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  {tr("Layer usage", "レイヤー使用率")}
                </h3>
                <div className="space-y-1">
                  {deviceLayerTotals.map(({ layerIndex, count, share }) => (
                    <div key={layerIndex} className="flex items-center gap-2">
                      <span className="text-xs w-16 truncate text-[var(--color-text-secondary)]">
                        {layerNames[layerIndex] || `Layer ${layerIndex}`}
                      </span>
                      <div className="flex-1 h-1.5 rounded bg-[var(--color-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-electric)]"
                          style={{ width: `${Math.round(share * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs w-8 text-right text-[var(--color-text-muted)]">
                        {count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  {tr("Most typed keys", "よく打っているキー")}
                </h3>
                {topKeycodes.length === 0 && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {tr(
                      "No keycode data. Requires CONFIG_ZMK_KEY_USAGE_TRACK_KEYCODES=y.",
                      "キーコード別のデータがありません。CONFIG_ZMK_KEY_USAGE_TRACK_KEYCODES=y が必要です。",
                    )}
                  </p>
                )}
                <ol className="space-y-1">
                  {topKeycodes.map((entry) => (
                    <li
                      key={`${entry.usagePage}:${entry.keycode}`}
                      className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]"
                    >
                      <span className="px-1.5 py-0.5 rounded bg-[var(--color-border)] font-mono text-[10px] min-w-[2.2rem] text-center">
                        {keycodeLabel(entry.usagePage, entry.keycode)}
                      </span>
                      <div className="flex-1 h-1.5 rounded bg-[var(--color-border)] overflow-hidden">
                        <div
                          className="h-full bg-[var(--color-electric)]"
                          style={{
                            width: `${
                              topKeycodes[0].count > 0
                                ? Math.round(
                                    (entry.count / topKeycodes[0].count) * 100,
                                  )
                                : 0
                            }%`,
                          }}
                        />
                      </div>
                      <span className="text-[10px] w-14 text-right text-[var(--color-text-muted)]">
                        {entry.count}
                        {keycodeTotal > 0 &&
                          ` (${Math.round((entry.count / keycodeTotal) * 100)}%)`}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div>
                <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  {tr("Export for analysis", "分析用にデータ出力")}
                </h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    className="btn-electric text-xs flex items-center gap-1"
                    onClick={() => void handleCopyMarkdown()}
                  >
                    <IconCopy size={13} />
                    {copyState === "copied"
                      ? tr("Copied", "コピーしました")
                      : copyState === "failed"
                        ? tr("Copy failed", "コピーに失敗")
                        : tr("Copy AI text", "AI用テキスト")}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs flex items-center gap-1"
                    onClick={handleDownloadMarkdown}
                  >
                    <IconDownload size={13} />
                    {tr("Markdown", "Markdown")}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs flex items-center gap-1"
                    onClick={handleDownloadJson}
                  >
                    <IconDownload size={13} />
                    {tr("JSON", "JSON")}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs flex items-center gap-1"
                    onClick={handleDownloadCsv}
                  >
                    <IconDownload size={13} />
                    {tr("CSV", "CSV")}
                  </button>
                </div>
              </div>
            </>
          )}

          {!deviceUsage.stats &&
            !deviceUsage.isLoading &&
            deviceUsage.isAvailable && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {tr(
                  "Press “Read from keyboard” to load the stored counters.",
                  "「キーボードから読み出す」を押すと保存済みのカウンタを取得します。",
                )}
              </p>
            )}
        </div>
      )}

      {tab === "prediction" && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            {tr(
              "Estimates how busy each key would be under the layout you're currently editing, by projecting the device's per-key (not per-position) press history onto the new bindings. Read the device counters on the “On device” tab first.",
              "編集中のキー配置で各キーがどれくらい使われそうかを、デバイス上のキー別（位置別ではない）打鍵履歴を新しい割り当てに当てはめて見積もります。まず「デバイス上」タブでカウンタを読み出してください。",
            )}
          </p>

          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-text-muted)]">
              {tr("Layout view", "表示レイヤー")}:
            </span>
            <select
              value={predictionScope}
              onChange={(event) => setPredictionScope(event.target.value)}
              className="px-2 py-1 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs text-[var(--color-text)]"
            >
              <option value="all">
                {tr("All layers combined", "全レイヤー統合")}
              </option>
              {layersForSelector.map((layer, index) => (
                <option key={layer.id} value={String(index)}>
                  {(layer.name || `Layer ${index}`) +
                    (index === 0 ? tr(" (default)", "（デフォルト）") : "")}
                </option>
              ))}
            </select>
          </div>

          {keycodeUsageMap.size === 0 && (
            <div className="flex items-center gap-2">
              <p className="text-xs text-[var(--color-text-muted)] flex-1">
                {tr(
                  "No device keycode history yet.",
                  "デバイスのキー別履歴がまだありません。",
                )}
              </p>
              <button
                type="button"
                className="btn-electric text-xs flex items-center gap-1 flex-shrink-0"
                onClick={() => void deviceUsage.fetchStats()}
                disabled={
                  !deviceUsage.isAvailable ||
                  deviceUsage.isLoading ||
                  deviceUsage.isMutating
                }
              >
                <IconRefresh size={13} />
                {tr("Read", "読み出す")}
              </button>
            </div>
          )}

          {activeLayout && keycodeUsageMap.size > 0 && (
            <KeyUsageHeatmapSvg
              layout={activeLayout}
              getCount={(position) =>
                predictedCountsByPosition.get(position) ?? 0
              }
              maxCount={predictedMaxCount}
            />
          )}

          {keycodeUsageMap.size > 0 && (
            <>
              <p className="text-xs text-[var(--color-text-muted)]">
                {tr("Predicted total", "予測総打鍵数")}: {predictedTotal}
              </p>
              <div>
                <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-1.5">
                  {tr("Predicted top keys", "予測される打鍵の多いキー")}
                </h3>
                {topPredictedKeys.length === 0 && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {tr("No data yet.", "まだデータがありません。")}
                  </p>
                )}
                <ol className="space-y-1">
                  {topPredictedKeys.map(({ position, count }) => (
                    <li
                      key={position}
                      className="text-xs text-[var(--color-text-secondary)] flex items-center gap-2"
                    >
                      <span className="font-mono text-[var(--color-text-muted)]">
                        #{position}
                      </span>
                      <span className="flex-1 truncate">
                        {labelForBinding(predictionLabelLayerIndex, position) ||
                          "—"}
                      </span>
                      <span className="text-[var(--color-text-muted)]">
                        {count}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
