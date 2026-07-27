/**
 * Battery History Section (Insights page)
 *
 * Shows the battery-level history recorded on the keyboard by the
 * zmk-module-battery-history firmware module (custom subsystem
 * "zmk__battery_history"). One RPC request kicks off the transfer and the
 * entries then arrive as streaming custom notifications, one batch per split
 * side (source 0 = central, 1+ = peripherals).
 *
 * 【2026-07-27】
 * - 受信途中でも逐次グラフを描く（is_last を待たない）。BLEでは転送が
 *   遅いので、待ちを前提にすると何も見えない。
 * - 取得した履歴はブラウザに蓄積（batteryHistoryStore）し、本体の
 *   リングバッファから消えた古い分も含めて長期の推移を見られる。
 * - 上昇区間（充電）と下降区間（放電）を色分けして描画する。
 *
 * 【2026-07-27 追記 / なぜ enqueueRpc を通すのか】
 * ここは以前、独自に ZMKCustomSubsystem を作って service.callRPC() を直接
 * await していた。つまりアプリ全体の RPC 直列化キュー（{@link enqueueRpc}）を
 * 唯一バイパスしていた箇所。さらにマウント直後に自動取得していたため、
 * Insights タブを開くと「キューに並んだキーマップ全体の読み込み」と
 * 「キューに並んでいない履歴取得」が同時に走り、ライブラリ側 mutex の待ちが
 * キーマップ側の 30 秒タイムアウトを食い潰していた。タイムアウトした
 * 呼び出しが mutex を途中で放棄すると応答ストリームがずれ、以降の全 RPC が
 * 壊れて "GATT Server is disconnected" で切断される。
 * → 症状: ヒートマップが出ない／エクスポート欄に「キーマップの読込に失敗」／
 *   直後に BLE 切断・再接続。ファームウェアは無罪。
 * 対策は2つ。(1) この画面の RPC も必ずキューを通す。(2) 自動取得は
 * 「転送が本当に空いてから」に遅延させる（下の useEffect）。
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
import { ConnectionContext } from "./DeviceConnection";
import { useLanguage } from "../hooks/useLanguage";
import { useStudioUnlock } from "../hooks/useStudioUnlock";
import { studioLockErrorText } from "../lib/studioUnlock";
import { enqueueRpc, rpcQueueDepth } from "../lib/rpcQueue";
import { hasKeymapLoadListeners } from "../lib/keymapLoadCoordinator";
import {
  clearBatteryHistory,
  loadBatteryHistory,
  mergePoints,
  saveBatteryHistory,
  toAbsoluteTimestamps,
  MIN_EPOCH_SECONDS,
  type BatteryPoint,
} from "../lib/batteryHistoryStore";
import {
  Notification as BatteryHistoryNotificationWrapper,
  Request as BatteryHistoryRequest,
  Response as BatteryHistoryResponse,
} from "../proto/zmk/battery_history/battery_history";

// Custom subsystem identifier -- must match the firmware registration in
// cormoran/zmk-module-battery-history.
export const BATTERY_HISTORY_SUBSYSTEM_IDENTIFIER = "zmk__battery_history";

/** How often the auto-fetch gate re-checks whether the transport is idle. */
const IDLE_POLL_MS = 700;

/**
 * Consecutive idle polls required before the automatic fetch is allowed to
 * start. A keymap load is a long SEQUENCE of round-trips, so the queue is
 * momentarily empty between two of them; a single idle sample is not enough
 * evidence that the load has finished.
 */
const IDLE_POLLS_REQUIRED = 3;

interface StreamingProgress {
  current: number;
  total: number;
}

const CHART_WIDTH = 640;
const CHART_HEIGHT = 200;
const CHART_PAD = 28;

type RangeId = "24h" | "7d" | "all";

const RANGE_HOURS: Record<RangeId, number | null> = {
  "24h": 24,
  "7d": 24 * 7,
  all: null,
};

function formatTimestamp(timestampSec: number, language: string): string {
  if (timestampSec >= MIN_EPOCH_SECONDS) {
    return new Date(timestampSec * 1000).toLocaleString(
      language === "ja" ? "ja-JP" : undefined,
      { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" },
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
  const connection = useContext(ConnectionContext);
  const { runWithUnlock } = useStudioUnlock();
  const deviceKey = connection.deviceName || "default";

  // ブラウザに蓄積された過去分（常に絶対時刻）と、今受信中の分を別々に持つ。
  const [storedBySource, setStoredBySource] = useState<
    Record<number, BatteryPoint[]>
  >({});
  const [liveBySource, setLiveBySource] = useState<
    Record<number, BatteryPoint[]>
  >({});
  const [selectedSource, setSelectedSource] = useState(0);
  const [range, setRange] = useState<RangeId>("all");
  const [progressBySource, setProgressBySource] = useState<
    Record<number, StreamingProgress>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [isWaitingForIdle, setIsWaitingForIdle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const buffersRef = useRef<Record<number, BatteryPoint[]>>({});
  const autoFetchedRef = useRef(false);
  const deviceKeyRef = useRef(deviceKey);

  useEffect(() => {
    deviceKeyRef.current = deviceKey;
    setStoredBySource(loadBatteryHistory(window.localStorage, deviceKey));
  }, [deviceKey]);

  const subsystem = zmkApp?.findSubsystem(
    BATTERY_HISTORY_SUBSYSTEM_IDENTIFIER,
  );

  const sourceLabel = useCallback(
    (sourceId: number): string =>
      sourceId === 0
        ? tr("Central", "セントラル側")
        : tr(`Peripheral ${sourceId}`, `ヘリフェラル側 ${sourceId}`),
    [tr],
  );

  // Entries stream in as custom notifications, potentially from several split
  // sides in parallel; buffer per source, show progress live, and persist the
  // batch once the last entry arrives.
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
            buffersRef.current[sourceId].push({
              timestamp: item.entry.timestamp,
              batteryLevel: item.entry.batteryLevel,
            });
            // 逐次描画用にその場で反映する（is_last を待たない）。
            setLiveBySource((prev) => ({
              ...prev,
              [sourceId]: [...(buffersRef.current[sourceId] ?? [])],
            }));
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
            setLiveBySource((prev) => {
              const next = { ...prev };
              delete next[sourceId];
              return next;
            });
            const absolute = toAbsoluteTimestamps(entries, Date.now() / 1000);
            const merged = saveBatteryHistory(
              window.localStorage,
              deviceKeyRef.current,
              sourceId,
              absolute,
            );
            setStoredBySource((prev) => ({ ...prev, [sourceId]: merged }));
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
      // 必ず enqueueRpc を通す。unlock ゲートはキューの外側（キュー枠を
      // 掴んだままユーザーの操作を待たないため）。
      const responsePayload = await runWithUnlock(() =>
        enqueueRpc(() => service.callRPC(payload)),
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
        "Clear all battery history stored on the keyboard and in this browser?",
        "キーボードとこのブラウザに保存されているバッテリー履歴をすべて消去しますか？",
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
        enqueueRpc(() => service.callRPC(payload)),
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
      clearBatteryHistory(window.localStorage, deviceKeyRef.current);
      setStoredBySource({});
      setLiveBySource({});
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
  }, [zmkApp, subsystem, runWithUnlock, tr]);

  /**
   * Auto-fetch once per connection -- but only once the transport is genuinely
   * idle.
   *
   * Opening Insights mounts this section AND starts InsightsPage's keymap load
   * at the same time. Firing the history transfer right then is what used to
   * kill the session (see the module doc). The queue would now keep the two
   * calls from interleaving anyway, but a ~50-entry notification stream still
   * competes with the keymap load for BLE airtime, so we simply wait for the
   * load to finish before asking.
   */
  useEffect(() => {
    if (!subsystem || autoFetchedRef.current) return;

    let idlePolls = 0;
    setIsWaitingForIdle(true);

    const timer = window.setInterval(() => {
      // rpcQueueDepth() covers calls queued or in flight; the coordinator flag
      // covers the fast path's deferred layers/behaviors phase, which fetches
      // in the background after the first paint.
      if (rpcQueueDepth() > 0 || hasKeymapLoadListeners()) {
        idlePolls = 0;
        return;
      }
      idlePolls += 1;
      if (idlePolls < IDLE_POLLS_REQUIRED) return;

      window.clearInterval(timer);
      autoFetchedRef.current = true;
      setIsWaitingForIdle(false);
      void fetchHistory();
    }, IDLE_POLL_MS);

    return () => {
      window.clearInterval(timer);
      setIsWaitingForIdle(false);
    };
  }, [subsystem, fetchHistory]);

  // Reset the in-flight state when disconnected so a reconnect starts fresh.
  // 蓄積済みの履歴（storedBySource）は意図的に保持する。
  useEffect(() => {
    if (!zmkApp?.state.connection) {
      setLiveBySource({});
      setProgressBySource({});
      buffersRef.current = {};
      autoFetchedRef.current = false;
      setError(null);
      setIsLoading(false);
    }
  }, [zmkApp?.state.connection]);

  const availableSources = useMemo(() => {
    const ids = new Set<number>();
    for (const key of Object.keys(storedBySource)) ids.add(Number(key));
    for (const key of Object.keys(liveBySource)) ids.add(Number(key));
    return [...ids].sort((a, b) => a - b);
  }, [storedBySource, liveBySource]);

  const activeSource = availableSources.includes(selectedSource)
    ? selectedSource
    : (availableSources[0] ?? 0);

  // 蓄積分＋受信中の分をマージして表示。受信中の分はその時点の最大値を
  // 基準に絶対時刻へ換算する（ファームが起動相対秒を返す場合の暗黙値）。
  const allPoints = useMemo(() => {
    const stored = storedBySource[activeSource] ?? [];
    const live = liveBySource[activeSource] ?? [];
    if (live.length === 0) return stored;
    return mergePoints(stored, toAbsoluteTimestamps(live, Date.now() / 1000));
  }, [storedBySource, liveBySource, activeSource]);

  const points = useMemo(() => {
    const hours = RANGE_HOURS[range];
    if (hours === null || allPoints.length === 0) return allPoints;
    const latest = allPoints[allPoints.length - 1].timestamp;
    const from = latest - hours * 3600;
    return allPoints.filter((point) => point.timestamp >= from);
  }, [allPoints, range]);

  const chart = useMemo(() => {
    if (points.length < 2) return null;
    const minT = points[0].timestamp;
    const maxT = points[points.length - 1].timestamp;
    const span = Math.max(1, maxT - minT);
    const innerW = CHART_WIDTH - CHART_PAD * 2;
    const innerH = CHART_HEIGHT - CHART_PAD * 2;
    const toX = (timestamp: number) =>
      CHART_PAD + ((timestamp - minT) / span) * innerW;
    const toY = (level: number) =>
      CHART_PAD + (1 - Math.min(100, Math.max(0, level)) / 100) * innerH;
    const segments = points.slice(1).map((point, index) => {
      const previous = points[index];
      return {
        x1: toX(previous.timestamp),
        y1: toY(previous.batteryLevel),
        x2: toX(point.timestamp),
        y2: toY(point.batteryLevel),
        // 上昇は充電中とみなして色を分ける。
        charging: point.batteryLevel > previous.batteryLevel,
      };
    });
    return { minT, maxT, segments };
  }, [points]);

  const stats = useMemo(() => {
    if (points.length < 2) return null;
    const levels = points.map((point) => point.batteryLevel);
    const minLevel = Math.min(...levels);
    const maxLevel = Math.max(...levels);
    const first = points[0];
    const last = points[points.length - 1];

    // 上昇に転じた回数（おおよその充電回数）と、直近の連続した下降区間から
    // 消費ヘースを求める。全体の差分で計算すると充電を含んで意味がなくなる。
    let chargeSessions = 0;
    let wasCharging = false;
    let dischargeSeconds = 0;
    let dischargeDrop = 0;
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index];
      const isCharging = current.batteryLevel > previous.batteryLevel;
      if (isCharging && !wasCharging) chargeSessions += 1;
      wasCharging = isCharging;
      if (current.batteryLevel < previous.batteryLevel) {
        dischargeSeconds += current.timestamp - previous.timestamp;
        dischargeDrop += previous.batteryLevel - current.batteryLevel;
      }
    }
    const drainRate =
      dischargeSeconds > 0 ? dischargeDrop / (dischargeSeconds / 3600) : 0;
    const remainingHours = drainRate > 0 ? last.batteryLevel / drainRate : null;
    const spanHours = (last.timestamp - first.timestamp) / 3600;
    return {
      minLevel,
      maxLevel,
      current: last.batteryLevel,
      drainRate,
      remainingHours,
      chargeSessions,
      spanHours,
      count: points.length,
    };
  }, [points]);

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
              "Recorded on the keyboard and also kept in this browser, so older entries stay visible after the keyboard's ring buffer wraps. Rising sections are charging, falling sections are discharging.",
              "キーボード本体の記録を取得し、このブラウザにも蓄積します（本体の履歴が上書きされても過去分を見られます）。上昇している区間が充電中、下降している区間が使用中です。",
            )}
          </p>

          {error && (
            <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {isWaitingForIdle && streamingSources.length === 0 && (
            <p className="mb-2 text-xs text-[var(--color-text-muted)]">
              {tr(
                "Waiting for the keymap transfer to finish before reading the history…",
                "キーマップの転送が終わるのを待ってから履歴を取得します…",
              )}
            </p>
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

          <div className="flex flex-wrap items-center gap-3 mb-3">
            {availableSources.length > 1 && (
              <div className="flex items-center gap-2">
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

            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">
                {tr("Range:", "表示範囲:")}
              </span>
              <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
                {(
                  [
                    ["24h", tr("24h", "24時間")],
                    ["7d", tr("7d", "7日")],
                    ["all", tr("All", "全期間")],
                  ] as Array<[RangeId, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setRange(id)}
                    className={`rounded px-2 py-0.5 text-xs transition-colors ${
                      range === id
                        ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {points.length === 0 &&
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
              {chart.segments.map((segment, index) => (
                <line
                  key={index}
                  x1={segment.x1}
                  y1={segment.y1}
                  x2={segment.x2}
                  y2={segment.y2}
                  stroke={
                    segment.charging
                      ? "var(--color-neon)"
                      : "var(--color-electric)"
                  }
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              ))}
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

          {points.length === 1 && (
            <p className="text-sm text-[var(--color-text-secondary)]">
              {tr("Latest level:", "最新の残量:")} {points[0].batteryLevel}%
              {" ("}
              {formatTimestamp(points[0].timestamp, language)}
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
                {tr("Drain rate", "消費ヘース")}:{" "}
                {stats.drainRate > 0 ? `${stats.drainRate.toFixed(2)}%/h` : "—"}
              </span>
              <span>
                {tr("Charges", "充電回数")}: {stats.chargeSessions}
              </span>
              <span>
                {tr("Samples", "サンプル数")}: {stats.count}
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
