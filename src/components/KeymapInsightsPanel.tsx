import { useMemo, useState } from "react";
import { IconChartBar, IconRefresh } from "@tabler/icons-react";
import type {
  BehaviorBinding,
  BehaviorDefinition,
  Layer,
  PhysicalLayout,
} from "../hooks/useKeymap";
import { useKeyUsage } from "../hooks/useKeyUsage";
import { useLiveKeyUsageStats } from "../hooks/useLiveKeyUsageStats";
import type { KeyboardLayoutType } from "../lib/keyboardLayouts";
import { formatComboBehavior } from "./macroCombo/comboUtils";
import { KeyUsageHeatmapSvg } from "./KeyUsageHeatmapSvg";

type InsightsTab = "live" | "device";

/**
 * Sidebar panel shown next to the keymap editor (see KeymapPage) so the user
 * can watch the heatmap / key usage while deciding how to lay out keys,
 * instead of switching tabs back and forth.
 *
 * - "Live" tab: presses recorded in this browser while Stream is on (shared
 *   with the Insights tab's heatmap via useLiveKeyUsageStats).
 * - "Device" tab: cumulative counters stored on the keyboard itself (same
 *   data source as the Key Usage tab), fetched on demand.
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
  const deviceCountsByPosition = useMemo(() => {
    const counts = new Map<number, number>();
    for (const entry of devicePositions) {
      counts.set(
        entry.position,
        (counts.get(entry.position) ?? 0) + entry.count,
      );
    }
    return counts;
  }, [devicePositions]);
  const deviceMaxCount = useMemo(() => {
    let max = 0;
    deviceCountsByPosition.forEach((count) => {
      if (count > max) max = count;
    });
    return max;
  }, [deviceCountsByPosition]);

  return (
    <aside className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <IconChartBar size={18} className="text-[var(--color-electric)]" />
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          {tr("Insights", "インサイト")}
        </h2>
      </div>

      <div className="flex items-center gap-1 mb-3 p-0.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] w-fit">
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
        <div className="space-y-3">
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
          {deviceUsage.stats && activeLayout && (
            <KeyUsageHeatmapSvg
              layout={activeLayout}
              getCount={(position) =>
                deviceCountsByPosition.get(position) ?? 0
              }
              maxCount={deviceMaxCount}
            />
          )}
          {deviceUsage.stats && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {tr("Total presses", "総打鍵数")}:{" "}
              {deviceUsage.stats.metadata.totalPresses}
            </p>
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
    </aside>
  );
}
