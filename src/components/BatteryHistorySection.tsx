/**
 * Battery History Section (Insights page)
 *
 * Shows the battery-level history recorded on the keyboard by the
 * zmk-module-battery-history firmware module (custom subsystem
 * "zmk__battery_history"). One RPC request kicks off the transfer and the
 * entries then arrive as streaming custom notifications, one batch per split
 * side (source 0 = central, 1+ = peripherals).
 */
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { IconBattery, IconRefresh, IconTrash } from "@tabler/icons-react";
import {
  ZMKAppContext,
  ZMKCustomSubsystem,
} from "@cormoran/zmk-studio-react-hook";
import { useLanguage } from "../hooks/useLanguage";
import { useStudioUnlock } from "../hooks/useStudioUnlock";
import { studioLockErrorText } from "../lib/studioUnlock";
import {
  Notification as BatteryHistoryNotificationWrapper,
  Request as BatteryHistoryRequest,
  Response as BatteryHistoryResponse,
  type BatteryHistoryEntry,
} from "../proto/zmk/battery_history/battery_history";

// Custom subsystem identifier -- must match the firmware registration in
// cormoran/zmk-module-battery-history.
export const BATTERY_HISTORY_SUBSYSTEM_IDENTIFIER = "zmk__battery_history";

interface StreamingProgress {
  current: number;
  total: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const CHART_PAD = 26;

// The module records unix-epoch seconds once the firmware clock has been
// synced; before any sync the values are (roughly) seconds since boot.
// Values below ~2001-09-09 cannot be real dates, so show elapsed time.
function formatTimestamp(timestampSec: number, language: string): string {
  if (timestampSec >= 1_000_000_000) {
    return new Date(timestampSec * 1000).toLocaleString(
      language === "ja" ? "ja-JP" : undefined,
    );
  }
  const hours = Math.floor(timestampSec / 3600);
  const minutes = Math.floor((timestampSec % 3600) / 60);
  return language === "ja"
    ? `起動後 ${hours}時間${minutes}分`
    : `+${hours}h ${minutes}m after boot`;
}

export function BatteryHistorySection() {
  const { language } = useLanguage();
  const tr = useCallback(
    (en: string, ja: string) => (language === "ja" ? ja : en),
    [language],
  );
  const zmkApp = useContext(ZMKAppContext);
  const { runWithUnlock } = useStudioUnlock();

  const [entriesBySource, setEntriesBySource] = useState<
    Record<number, BatteryHistoryEntry[]>
  >({});
  const [selectedSource, setSelectedSource] = useState(0);
  const [progressBySource, setProgressBySource] = useState<
    Record<number, StreamingProgress>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const buffersRef = useRef<Record<number, BatteryHistoryEntry[]>>({});
  const autoFetchedRef = useRef(false);

  const subsystem = zmkApp?.findSubsystem(
    BATTERY_HISTORY_SUBSYSTEM_IDENTIFIER,
  );

  const sourceLabel = useCallback(
    (sourceId: number): string =>
      sourceId === 0
        ? tr("Central", "セントラル側")
        : tr(`Peripheral ${sourceId}`, `ペリフェラル側 ${sourceId}`),
    [tr],
  );

  // Entries stream in as custom notifications, potentially from several split
  // sides in parallel; buffer per source and commit the batch on is_last.
  useEffect(() => {
    if (!zmkApp || !subsystem) return;

    const unsubscribe = zmkApp.onNotification({
      type: "custom",
      subsystemIndex: subsystem.index,
      callback: (notification) => {
        if (!notification.payload) return;
        try {
          const decoded = BatteryHistoryNotificationWrapper.decode(
            notification.payload,
          );
          const item = decoded.batteryHistory;
          if (!item) return;
          const sourceId = item.sourceId;

          if (item.entryIndex === 0) {
            buffersRef.current[sourceId] = [];
          }

          if (item.entry && item.totalEntries > 0) {
            if (!buffersRef.current[sourceId]) {
              buffersRef.current[sourceId] = [];
            }
            buffersRef.current[sourceId].push(item.entry);
            setProgressBySource((prev) => ({
              ...prev,
              [sourceId]: {
                current: item.entryIndex + 1,
                total: item.totalEntries,
              },
            }));
          }

          if (item.isLast) {
            const entries = [...(buffersRef.current[sourceId] ?? [])];
            delete buffersRef.current[sourceId];
            setProgressBySource((prev) => {
              const next = { ...prev };
              delete next[sourceId];
              return next;
            });
            setEntriesBySource((prev) => ({ ...prev, [sourceId]: entries }));
            setLastFetched(new Date());
          }
        } catch (err) {
          console.error("Failed to decode battery history notification:", err);
        }
      },
    });

    return unsubscribe;
  }, [zmkApp, subsystem]);

  const fetchHistory = useCallback(async () => {
    if (!zmkApp?.state.connection || !subsystem) return;
    setIsLoading(true);
    setError(null);
    buffersRef.current = {};
    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index,
      );
      const payload = BatteryHistoryRequest.encode(
        BatteryHistoryRequest.create({ getHistory: {} }),
      ).finish();
      const responsePayload = await runWithUnlock(() =>
        service.callRPC(payload),
      );
      // The response is just an acknowledgement; data arrives via the
      // streaming notifications handled above.
      if (responsePayload) {
        const response = BatteryHistoryResponse.decode(responsePayload);
        if (response.error) {
          setError(
            response.error.message || tr("Unknown error", "不明なエラー"),
          );
        }
      }
    } catch (err) {
      console.error("Failed to fetch battery history:", err);
      const locked = studioLockErrorText(err);
      setError(
        locked ??
          (err instanceof Error
            ? err.message
            : tr(
                "Failed to request battery history",
                "バッテリー履歴の取得に失敗しました",
              )),
      );
      setProgressBySource({});
    } finally {
      setIsLoading(false);
    }
  }, [zmkApp, subsystem, runWithUnlock, tr]);

  const clearHistory = useCallback(async () => {
    if (!zmkApp?.state.connection || !subsystem) return;
    const confirmed = window.confirm(
      tr(
        "Clear all battery history stored on the keyboard?",
        "キーボードに保存されているバッテリー履歴をすべて消去しますか？",
      ),
    );
    if (!confirmed) return;

    setIsLoading(true);
    setError(null);
    try {
      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystem.index,
      );
      const payload = BatteryHistoryRequest.encode(
        BatteryHistoryRequest.create({ clearHistory: {} }),
      ).finish();
      const responsePayload = await runWithUnlock(() =>
        service.callRPC(payload),
      );
      if (responsePayload) {
        const response = BatteryHistoryResponse.decode(responsePayload);
        if (response.error) {
          setError(
            response.error.message || tr("Unknown error", "不明なエラー"),
          );
          return;
        }
      }
      setEntriesBySource({});
      await fetchHistory();
    } catch (err) {
      console.error("Failed to clear battery history:", err);
      const locked = studioLockErrorText(err);
      setError(
        locked ??
          (err instanceof Error
            ? err.message
            : tr(
                "Failed to clear battery history",
                "バッテリー履歴の消去に失敗しました",
              )),
      );
    } finally {
      setIsLoading(false);
    }
  }, [zmkApp, subsystem, runWithUnlock, fetchHistory, tr]);

  // Auto-fetch once per connection when the subsystem is available.
  useEffect(() => {
    if (subsystem && !autoFetchedRef.current) {
      autoFetchedRef.current = true;
      void fetchHistory();
    }
  }, [subsystem, fetchHistory]);

  // Reset when disconnected so a reconnect starts fresh.
  useEffect(() => {
    if (!zmkApp?.state.connection) {
      setEntriesBySource({});
      setProgressBySource({});
      buffersRef.current = {};
      autoFetchedRef.current = false;
      setError(null);
      setLastFetched(null);
      setIsLoading(false);
    }
  }, [zmkApp?.state.connection]);

  const availableSources = useMemo(
    () =>
      Object.keys(entriesBySource)
        .map(Number)
        .sort((a, b) => a - b),
    [entriesBySource],
  );
  const activeSource = availableSources.includes(selectedSource)
    ? selectedSource
    : (availableSources[0] ?? 0);
  const entries = useMemo(
    () => entriesBySource[activeSource] ?? [],
    [entriesBySource, activeSource],
  );

  const chart = useMemo(() => {
    if (entries.length < 2) return null;
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const minT = sorted[0].timestamp;
    const maxT = sorted[sorted.length - 1].timestamp;
    const span = Math.max(1, maxT - minT);
    const innerW = CHART_WIDTH - CHART_PAD * 2;
    const innerH = CHART_HEIGHT - CHART_PAD * 2;
    const points = sorted
      .map((entry) => {
        const x = CHART_PAD + ((entry.timestamp - minT) / span) * innerW;
        const y =
          CHART_PAD +
          (1 - Math.min(100, entry.batteryLevel) / 100) * innerH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    return { sorted, minT, maxT, points };
  }, [entries]);

  const stats = useMemo(() => {
    if (entries.length < 2) return null;
    const sorted = [...entries].sort((a, b) => a.timestamp - b.timestamp);
    const levels = sorted.map((entry) => entry.batteryLevel);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const hoursSpan = (last.timestamp - first.timestamp) / 3600;
    const drainRate =
      hoursSpan > 0 ? (first.batteryLevel - last.batteryLevel) / hoursSpan : 0;
    const remainingHours =
      drainRate > 0 ? last.batteryLevel / drainRate : null;
    return { minLevel, maxLevel, current: last.batteryLevel, drainRate, remainingHours };
  }, [entries]);

  const streamingSources = Object.keys(progressBySource).map(Number);

  return (
    <section className="glass-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <IconBattery size={18} className="text-[var(--color-electric)]" />
        <h2 className="text-sm font-medium text-[var(--color-text)]">
          {tr("Battery history", "バッテリー履歴")}
        </h2>
        {subsystem && (
          <div className="ml-auto flex items-center gap-2">
            <button
              className="btn-ghost text-sm flex items-center gap-1.5"
              onClick={() => void clearHistory()}
              disabled={isLoading || streamingSources.length > 0}
            >
              <IconTrash size={15} />
              {tr("Clear history", "履歴を消去")}
            </button>
            <button
              className="btn-electric text-sm flex items-center gap-1.5"
              onClick={() => void fetchHistory()}
              disabled={isLoading || streamingSources.length > 0}
            >
              <IconRefresh
                size={15}
                className={isLoading ? "animate-spin" : ""}
              />
              {tr("Refresh", "更新")}
            </button>
          </div>
        )}
      </div>

      {!subsystem && (
        <p className="text-sm text-[var(--color-text-muted)]">
          {tr(
            "Battery history subsystem is not available in this firmware (requires CONFIG_ZMK_BATTERY_HISTORY_STUDIO_RPC=y).",
            "このファームウェアではバッテリー履歴サブシステムが利用できません（CONFIG_ZMK_BATTERY_HISTORY_STUDIO_RPC=y が必要）。",
          )}
        </p>
      )}

      {subsystem && (
        <>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">
            {tr(
              "History recorded on the keyboard itself. Data is fetched from the device each time.",
              "キーボード本体に記録された残量履歴です。データは接続中の実機から取得します。",
            )}
          </p>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {streamingSources.map((sourceId) => {
            const progress = progressBySource[sourceId];
            return (
              <div key={sourceId} className="mb-2">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">
                  {tr("Receiving from", "受信中:")}{" "}
                  {sourceLabel(sourceId)} ({progress.current}/{progress.total})
                </p>
                <div className="h-1.5 rounded bg-[var(--color-border)] overflow-hidden">
                  <div
                    className="h-full bg-[var(--color-electric)] transition-all"
                    style={{
                      width:
                        progress.total > 0
                          ? `${Math.round((progress.current / progress.total) * 100)}%`
                          : "0%",
                    }}
                  />
                </div>
              </div>
            );
          })}

          {availableSources.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="text-xs text-[var(--color-text-muted)]">
                {tr("Keyboard half:", "左右の選択:")}
              </span>
              <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
                {availableSources.map((sourceId) => (
                  <button
                    key={sourceId}
                    type="button"
                    onClick={() => setSelectedSource(sourceId)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      sourceId === activeSource
                        ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {sourceLabel(sourceId)}
                  </button>
                ))}
              </div>
            </div>
          )}

          {entries.length === 0 &&
            streamingSources.length === 0 &&
            !isLoading && (
              <p className="text-sm text-[var(--color-text-muted)]">
                {tr(
                  "No history entries yet. The keyboard records battery levels periodically while powered on.",
                  "履歴はまだありません。電源が入っている間、キーボードが定期的に残量を記録します。",
                )}
              </p>
            )}

          {chart && (
            <svg
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              className="w-full max-w-3xl"
            >
              {[0, 25, 50, 75, 100].map((level) => {
                const y =
                  CHART_PAD +
                  (1 - level / 100) * (CHART_HEIGHT - CHART_PAD * 2);
                return (
                  <g key={level}>
                    <line
                      x1={CHART_PAD}
                      x2={CHART_WIDTH - CHART_PAD}
                      y1={y}
                      y2={y}
                      stroke="var(--color-border)"
                      strokeWidth={1}
                    />
                    <text
                      x={CHART_PAD - 6}
                      y={y}
                      textAnchor="end"
                      dominantBaseline="central"
                      fontSize={10}
                      fill="var(--color-text-muted)"
                    >
                      {level}
                    </text>
                  </g>
                );
              })}
              <polyline
                points={chart.points}
                fill="none"
                stroke="var(--color-electric)"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <text
                x={CHART_PAD}
                y={CHART_HEIGHT - 6}
                fontSize={10}
                fill="var(--color-text-muted)"
              >
                {formatTimestamp(chart.minT, language)}
              </text>
              <text
                x={CHART_WIDTH - CHART_PAD}
                y={CHART_HEIGHT - 6}
                textAnchor="end"
                fontSize={10}
                fill="var(--color-text-muted)"
              >
                {formatTimestamp(chart.maxT, language)}
              </text>
            </svg>
          )}

          {entries.length === 1 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {tr("Latest level:", "最新の残量:")} {entries[0].batteryLevel}%
              {" ("}
              {formatTimestamp(entries[0].timestamp, language)}
              {")"}
            </p>
          )}

          {stats && (
            <div className="flex flex-wrap gap-4 mt-3 text-sm text-[var(--color-text-secondary)]">
              <span>
                {tr("Current", "現在")}:{" "}
                <span className="text-[var(--color-electric)] font-medium">
                  {stats.current}%
                </span>
              </span>
              <span>
                {tr("Min", "最小")}: {stats.minLevel}%
              </span>
              <span>
                {tr("Max", "最大")}: {stats.maxLevel}%
              </span>
              <span>
                {tr("Drain rate", "消費ペース")}:{" "}
                {stats.drainRate > 0 ? `${stats.drainRate.toFixed(2)}%/h` : "—"}
              </span>
              {stats.remainingHours !== null && stats.remainingHours > 0 && (
                <span>
                  {tr("Est. remaining", "推定残り")}:{" "}
                  <span className="text-[var(--color-neon)] font-medium">
                    {stats.remainingHours > 24
                      ? tr(
                          `${Math.round(stats.remainingHours / 24)}d`,
                          `約${Math.round(stats.remainingHours / 24)}日`,
                        )
                      : tr(
                          `${Math.round(stats.remainingHours)}h`,
                          `約${Math.round(stats.remainingHours)}時間`,
                        )}
                  </span>
                </span>
              )}
            </div>
          )}

          {lastFetched && (
            <p className="text-xs text-[var(--color-text-muted)] mt-3">
              {tr("Last updated:", "最終更新:")}{" "}
              {lastFetched.toLocaleTimeString(
                language === "ja" ? "ja-JP" : undefined,
              )}
            </p>
          )}
        </>
      )}
    </section>
  );
}
