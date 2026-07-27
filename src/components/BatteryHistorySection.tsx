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
 *
 * 【2026-07-27 追記 / 推定残り時間がペリフェラル側で出なかった件】
 * ファームの timestamp は uint16 の「起動からの秒数」で、再起動や約18.2時間の
 * 桁溢れで 0 に戻る。以前はここで「隣り合う点の差」をそのまま消費量として
 * 積算していたため、境界をまたいだペアが混じると値が壊れ、結果として
 * 消費ヘースが 0 → 推定残り時間が非表示、という状態になっていた。
 * スリープ/再起動の多いペリフェラル側で特に起きやすい。
 * → 時刻の復元は batteryHistoryStore.toAbsoluteTimestamps()（セッション分割）、
 *   消費ヘースは estimateBatteryDrain()（境界をまたぐペアを除外し、直近の
 *   充電より後の下降ペアだけを平均）に集約した。
 *
 * 【2026-07-27 追記 / BLE切断とグラフの時間軸が読めない件】
 * (1) 切断: getHistory の RPC 自体はキューを通して直列化されているが、
 *   実データは RPC の外側で BLE 通知として連続で届く（本ファイル冒頭の
 *   説明の通り、まだ notification streaming 方式）。この通知バーストの間、
 *   他の RPC（キー使用率の再読込やキーマップ操作など）が同時に走ると
 *   BLE の帯域を奪い合い、以前キー使用率で直面したのと同種の切断が起きうる。
 *   これはファームウェア側（バッテリー履歴モジュール）をキー使用率と同じ
 *   カーソル方式のページング RPC に移行しないと根本解決しないため、
 *   本リポジトリ（フロントエンド）だけでは直せない。
 * (2) 時間軸: 以前は開始・終了の2点しかラベルが無く、途中の時刻が
 *   読めなかった。表示範囲（24h/7d/全期間）に応じて目盛り間隔を自動調整し
 *   (pickTickIntervalSeconds)、点線グリッド＋ラベルを描画するようにした。
 *   さらにグラフ上をホバーすると最寄りの点の時刻・残量をツールチップで
 *   表示する。
 */
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
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
  estimateBatteryDrain,
  loadBatteryHistory,
  mergePoints,
  saveBatteryHistory,
  toAbsoluteTimestamps,
  MIN_EPOCH_SECONDS,
  type BatteryDrainReason,
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

/** Minimum horizontal spacing (viewBox px) kept between two time-axis labels. */
const MIN_TICK_SPACING_PX = 50;

/** Candidate gridline spacings, smallest to largest; the first one that keeps
 * the tick count within the available width is used. */
const TIME_TICK_INTERVALS_SECONDS = [
  60,
  5 * 60,
  10 * 60,
  15 * 60,
  30 * 60,
  3600,
  2 * 3600,
  3 * 3600,
  4 * 3600,
  6 * 3600,
  12 * 3600,
  24 * 3600,
  2 * 86400,
  3 * 86400,
  7 * 86400,
  14 * 86400,
  30 * 86400,
  90 * 86400,
  365 * 86400,
];

const TOOLTIP_WIDTH = 122;
const TOOLTIP_HEIGHT = 40;

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

/** Short label for a time-axis gridline (coarser than formatTimestamp, since
 * several of these have to fit side-by-side without overlapping). */
function formatTickLabel(
  timestampSec: number,
  intervalSeconds: number,
  language: string,
): string {
  if (timestampSec < MIN_EPOCH_SECONDS) {
    const hours = Math.floor(timestampSec / 3600);
    const minutes = Math.floor((timestampSec % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, "0")}`;
  }
  const date = new Date(timestampSec * 1000);
  if (intervalSeconds >= 24 * 3600) {
    return date.toLocaleDateString(language === "ja" ? "ja-JP" : undefined, {
      month: "numeric",
      day: "numeric",
    });
  }
  return date.toLocaleTimeString(language === "ja" ? "ja-JP" : undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Picks the smallest candidate interval that keeps the number of gridlines
 * within `maxTicks`, so labels stay readable regardless of the selected
 * time range (24h / 7d / all). */
function pickTickIntervalSeconds(
  spanSeconds: number,
  maxTicks: number,
): number {
  for (const interval of TIME_TICK_INTERVALS_SECONDS) {
    if (spanSeconds / interval <= maxTicks) return interval;
  }
  return TIME_TICK_INTERVALS_SECONDS[TIME_TICK_INTERVALS_SECONDS.length - 1];
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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
        : tr(`Peripheral ${sourceId}`, `ペリフェラル側 ${sourceId}`),
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

  // 半/表示範囲を切り替えたら、古いグラフを指していたホバー状態を捨てる。
  useEffect(() => {
    setHoverIndex(null);
  }, [activeSource, range]);

  // 蓄積分＋受信中の分をマージして表示。受信中の分はセッション（再起動や
  // uint16 桁溢れの切れ目）ごとに絶対時刻へ換算する。
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
    const plotted = points.map((point) => ({
      x: toX(point.timestamp),
      y: toY(point.batteryLevel),
      timestamp: point.timestamp,
      batteryLevel: point.batteryLevel,
    }));
    // 時間軸のグリッド線。表示範囲に応じて間隔を自動調整する（1時間刻み〜
    // 数日刻みまで）。ラベルが重ならないよう、幅から最大本数を逆算する。
    const maxTicks = Math.max(3, Math.floor(innerW / MIN_TICK_SPACING_PX));
    const tickInterval = pickTickIntervalSeconds(span, maxTicks);
    const rawTicks: number[] = [];
    let cursor = Math.ceil(minT / tickInterval) * tickInterval;
    while (cursor <= maxT) {
      rawTicks.push(cursor);
      cursor += tickInterval;
    }
    const tickTimestamps = rawTicks.length >= 2 ? rawTicks : [minT, maxT];
    const ticks = tickTimestamps.map((timestamp) => {
      const x = toX(timestamp);
      const anchor: "start" | "middle" | "end" =
        x <= CHART_PAD + 18
          ? "start"
          : x >= CHART_WIDTH - CHART_PAD - 18
            ? "end"
            : "middle";
      return { x, timestamp, anchor };
    });
    return { minT, maxT, segments, plotted, ticks, tickInterval };
  }, [points]);

  const handleChartMouseMove = useCallback(
    (event: MouseEvent<SVGRectElement>) => {
      if (!chart || chart.plotted.length === 0) return;
      const svg = event.currentTarget.ownerSVGElement;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      if (rect.width === 0) return;
      const scale = CHART_WIDTH / rect.width;
      const svgX = (event.clientX - rect.left) * scale;
      let nearest = 0;
      let nearestDist = Infinity;
      for (let index = 0; index < chart.plotted.length; index += 1) {
        const dist = Math.abs(chart.plotted[index].x - svgX);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = index;
        }
      }
      setHoverIndex(nearest);
    },
    [chart],
  );

  const handleChartMouseLeave = useCallback(() => setHoverIndex(null), []);

  const hoverPoint =
    chart && hoverIndex !== null ? chart.plotted[hoverIndex] ?? null : null;

  // 消費ヘースと推定残り時間は共通ロジックに集約（セントラル/ペリフェラル
  // どちらでも同じ扱いになるようにするため）。
  const drain = useMemo(() => estimateBatteryDrain(points), [points]);

  const drainReasonText = useCallback(
    (reason: BatteryDrainReason): string => {
      switch (reason) {
        case "charging":
          return tr("charging now", "充電中のため未算出");
        case "no-decline":
          return tr("no discharge recorded yet", "残量が下がった記録がまだありません");
        default:
          return tr("not enough samples yet", "サンプルが足りません");
      }
    },
    [tr],
  );

  const stats = useMemo(() => {
    if (points.length < 2) return null;
    const levels = points.map((point) => point.batteryLevel);
    const first = points[0];
    const last = points[points.length - 1];
    return {
      minLevel: Math.min(...levels),
      maxLevel: Math.max(...levels),
      current: last.batteryLevel,
      spanHours: (last.timestamp - first.timestamp) / 3600,
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
              "Recorded on the keyboard and also kept in this browser, so older entries stay visible after the keyboard's ring buffer wraps. Rising sections are charging, falling sections are discharging. Hover the chart to see the exact time and level.",
              "キーボード本体の記録を取得し、このブラウザにも蓄積します（本体の履歴が上書きされても過去分を見られます）。上昇している区間が充電中、下降している区間が使用中です。グラフにマウスを合わせると正確な時刻と残量を確認できます。",
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
              style={{ cursor: "crosshair" }}
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
              {chart.ticks.map((tick, index) => (
                <g key={index}>
                  <line
                    x1={tick.x}
                    x2={tick.x}
                    y1={CHART_PAD}
                    y2={CHART_HEIGHT - CHART_PAD}
                    stroke="var(--color-border)"
                    strokeWidth={1}
                    strokeOpacity={0.5}
                    strokeDasharray="2 3"
                  />
                  <text
                    x={tick.x}
                    y={CHART_HEIGHT - 6}
                    textAnchor={tick.anchor}
                    fontSize={10}
                    fill="var(--color-text-muted)"
                  >
                    {formatTickLabel(tick.timestamp, chart.tickInterval, language)}
                  </text>
                </g>
              ))}
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
              <rect
                x={CHART_PAD}
                y={CHART_PAD}
                width={CHART_WIDTH - CHART_PAD * 2}
                height={CHART_HEIGHT - CHART_PAD * 2}
                fill="transparent"
                style={{ pointerEvents: "all" }}
                onMouseMove={handleChartMouseMove}
                onMouseLeave={handleChartMouseLeave}
              />
              {hoverPoint && (
                <g style={{ pointerEvents: "none" }}>
                  <line
                    x1={hoverPoint.x}
                    x2={hoverPoint.x}
                    y1={CHART_PAD}
                    y2={CHART_HEIGHT - CHART_PAD}
                    stroke="var(--color-text-muted)"
                    strokeDasharray="3 3"
                    strokeWidth={1}
                  />
                  <circle
                    cx={hoverPoint.x}
                    cy={hoverPoint.y}
                    r={3.5}
                    fill="var(--color-electric)"
                    stroke="var(--color-bg)"
                    strokeWidth={1.5}
                  />
                  <g
                    transform={`translate(${Math.min(
                      Math.max(hoverPoint.x + 10, CHART_PAD),
                      CHART_WIDTH - CHART_PAD - TOOLTIP_WIDTH,
                    )}, ${Math.min(
                      Math.max(hoverPoint.y - TOOLTIP_HEIGHT - 8, 4),
                      CHART_HEIGHT - TOOLTIP_HEIGHT - 4,
                    )})`}
                  >
                    <rect
                      width={TOOLTIP_WIDTH}
                      height={TOOLTIP_HEIGHT}
                      rx={6}
                      fill="var(--color-surface)"
                      stroke="var(--color-border)"
                      strokeWidth={1}
                    />
                    <text
                      x={8}
                      y={16}
                      fontSize={10}
                      fill="var(--color-text-muted)"
                    >
                      {formatTimestamp(hoverPoint.timestamp, language)}
                    </text>
                    <text
                      x={8}
                      y={31}
                      fontSize={12}
                      fontWeight={600}
                      fill="var(--color-electric)"
                    >
                      {hoverPoint.batteryLevel}%
                    </text>
                  </g>
                </g>
              )}
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
                {tr("Drain rate", "消費ペース")}:{" "}
                {drain.drainRatePerHour !== null &&
                drain.drainRatePerHour > 0 ? (
                  `${drain.drainRatePerHour.toFixed(2)}%/h`
                ) : (
                  <span className="text-[var(--color-text-muted)]">
                    {drainReasonText(drain.reason)}
                  </span>
                )}
              </span>
              <span>
                {tr("Charges", "充電回数")}: {drain.chargeSessions}
              </span>
              <span>
                {tr("Samples", "サンプル数")}: {stats.count}
              </span>
              {drain.remainingHours !== null && drain.remainingHours > 0 && (
                <span>
                  {tr("Est. remaining", "推定残り")}:{" "}
                  <span className="text-[var(--color-neon)] font-medium">
                    {drain.remainingHours > 24
                      ? tr(
                          `${Math.round(drain.remainingHours / 24)}d`,
                          `約${Math.round(drain.remainingHours / 24)}日`,
                        )
                      : tr(
                          `${Math.round(drain.remainingHours)}h`,
                          `約${Math.round(drain.remainingHours)}時間`,
                        )}
                  </span>
                </span>
              )}
            </div>
          )}

          {stats && drain.samplePairs > 0 && (
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {tr(
                `Estimate based on ${drain.samplePairs} discharge samples covering ${drain.sampleHours.toFixed(1)}h (pairs crossing a reboot or a timestamp wrap are ignored).`,
                `推定は放電区間 ${drain.samplePairs} ペア・計 ${drain.sampleHours.toFixed(1)} 時間分に基づきます（再起動やタイムスタンプ桁溢れをまたぐ区間は除外）。`,
              )}
            </p>
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
