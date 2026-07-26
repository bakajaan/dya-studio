/**
 * Insights page: feature-parity additions inspired by other keymap tools.
 * - Key usage heatmap & layer statistics (Oryx-style)
 * - Printable cheat sheet (SVG/PNG) + ZMK keymap (dtsi) export (Oryx / Keymap Editor)
 * - Keymap snapshots with diff (version history)
 * - Typing trainer (Oryx-style)
 * - Macro recorder (Vial-style) that appends recorded keys to a runtime macro slot
 */
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  IconCamera,
  IconChartBar,
  IconDownload,
  IconFlame,
  IconHistory,
  IconKeyboard,
  IconPlayerRecord,
  IconPlayerStop,
  IconRefresh,
  IconTrash,
  IconWand,
} from "@tabler/icons-react";
import { ConnectionContext } from "../components/DeviceConnection";
import { KeyboardLayoutContext } from "../contexts/KeyboardLayoutContext";
import { useKeymap } from "../hooks/useKeymap";
import { useLanguage } from "../hooks/useLanguage";
import { useInputStream } from "../hooks/useInputStream";
import { useRuntimeMacro } from "../hooks/useRuntimeMacro";
import { formatComboBehavior } from "../components/macroCombo/comboUtils";
import { getKeyPressBehaviorId } from "../components/macroCombo/macroStepUtils";
import { buildCheatsheetSvg, type CheatsheetLayer } from "../lib/cheatsheetSvg";
import { generateKeymapDtsi, type DtsiLayer } from "../lib/keymapDtsiExport";
import {
  clearStats,
  heatColor,
  heatLevel,
  layerShares,
  loadStats,
  maxPositionCount,
  recordKeyPress,
  saveStats,
  topPositions,
  type KeyUsageStats,
} from "../lib/keyUsageStats";
import {
  addSnapshot,
  diffSnapshots,
  listSnapshots,
  removeSnapshot,
  type KeymapSnapshot,
} from "../lib/keymapSnapshots";
import {
  buildRecorderSteps,
  hidUsageForEventCode,
  type RecordedKeyEvent,
} from "../lib/macroRecorder";
import {
  DEFAULT_DRILL_WORDS,
  computeWpm,
  evaluateTyping,
  pickDrill,
} from "../lib/typingTrainer";

const HEAT_UNIT = 48;
const DRILL_WORD_COUNT = 8;

function triggerDownload(filename: string, url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

function downloadFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  triggerDownload(filename, url);
  URL.revokeObjectURL(url);
}

export function InsightsPage() {
  const { t, language } = useLanguage();
  const tr = useCallback(
    (en: string, ja: string) => (language === "ja" ? ja : en),
    [language],
  );
  const connection = useContext(ConnectionContext);
  const keyboardLayoutContext = useContext(KeyboardLayoutContext);
  const keymap = useKeymap();
  const inputStream = useInputStream();
  const runtimeMacro = useRuntimeMacro();

  const layersForSelector = useMemo(() => {
    if (!keymap.keymap?.layers) return [];
    return keymap.keymap.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
    }));
  }, [keymap.keymap?.layers]);

  const labelForBinding = useCallback(
    (layerIndex: number, position: number): string => {
      const layer = keymap.keymap?.layers[layerIndex];
      const binding = layer?.bindings[position];
      if (!binding) return "";
      return formatComboBehavior(
        binding,
        keymap.behaviors,
        layersForSelector,
        keyboardLayoutContext.layout,
        runtimeMacro.macros,
        t,
      );
    },
    [
      keymap.keymap?.layers,
      keymap.behaviors,
      layersForSelector,
      keyboardLayoutContext.layout,
      runtimeMacro.macros,
      t,
    ],
  );

  const activeLayout = useMemo(() => {
    const layouts = keymap.physicalLayouts;
    if (!layouts || layouts.layouts.length === 0) return null;
    return layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
  }, [keymap.physicalLayouts]);

  // --- Key usage statistics (heatmap) ---

  const [stats, setStats] = useState<KeyUsageStats>(() =>
    loadStats(window.localStorage),
  );
  const prevHighlightedRef = useRef<ReadonlySet<number>>(new Set());

  // Key presses are derived from highlightedKeys additions: the input stream
  // adds a position on press and removes it on release, so set additions are
  // exactly the presses (the hook does not expose a raw key-event callback).
  useEffect(() => {
    const previous = prevHighlightedRef.current;
    const pressed: number[] = [];
    inputStream.highlightedKeys.forEach((position) => {
      if (!previous.has(position)) pressed.push(position);
    });
    prevHighlightedRef.current = new Set(inputStream.highlightedKeys);
    if (pressed.length === 0) return;
    const layerIndex = inputStream.activeLayerIndex ?? 0;
    setStats((current) => {
      let next = current;
      for (const position of pressed) {
        next = recordKeyPress(next, position, layerIndex);
      }
      return next;
    });
  }, [inputStream.highlightedKeys, inputStream.activeLayerIndex]);

  useEffect(() => {
    saveStats(window.localStorage, stats);
  }, [stats]);

  const maxCount = useMemo(() => maxPositionCount(stats), [stats]);
  const shares = useMemo(() => layerShares(stats), [stats]);
  const topKeys = useMemo(() => topPositions(stats, 5), [stats]);

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

  const handleResetStats = useCallback(() => {
    setStats(clearStats(window.localStorage));
  }, []);

  // --- Cheat sheet / dtsi export ---

  const buildCheatsheetLayers = useCallback((): CheatsheetLayer[] | null => {
    if (!keymap.keymap || !activeLayout) return null;
    return keymap.keymap.layers.map((layer, layerIndex) => ({
      name: layer.name || `Layer ${layerIndex}`,
      keys: activeLayout.keys.map((key, position) => ({
        x: key.x / 100,
        y: key.y / 100,
        width: key.width / 100,
        height: key.height / 100,
        r: key.r / 100,
        rx: key.rx / 100,
        ry: key.ry / 100,
        label: labelForBinding(layerIndex, position),
      })),
    }));
  }, [keymap.keymap, activeLayout, labelForBinding]);

  const handleDownloadCheatsheetSvg = useCallback(() => {
    const layers = buildCheatsheetLayers();
    if (!layers) return;
    const svg = buildCheatsheetSvg(layers, {
      title: connection.deviceName || "keymap",
    });
    downloadFile("keymap-cheatsheet.svg", svg, "image/svg+xml");
  }, [buildCheatsheetLayers, connection.deviceName]);

  const handleDownloadCheatsheetPng = useCallback(() => {
    const layers = buildCheatsheetLayers();
    if (!layers) return;
    const svg = buildCheatsheetSvg(layers, {
      title: connection.deviceName || "keymap",
    });
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.width * 2;
      canvas.height = image.height * 2;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(2, 2);
      context.drawImage(image, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        triggerDownload("keymap-cheatsheet.png", url);
        URL.revokeObjectURL(url);
      });
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [buildCheatsheetLayers, connection.deviceName]);

  const handleDownloadDtsi = useCallback(() => {
    if (!keymap.keymap) return;
    const layers: DtsiLayer[] = keymap.keymap.layers.map(
      (layer, layerIndex) => ({
        name: layer.name || `Layer ${layerIndex}`,
        bindings: layer.bindings.map((binding) => ({
          behaviorDisplayName:
            keymap.getBehavior(binding.behaviorId)?.displayName ??
            `behavior_${binding.behaviorId}`,
          param1: binding.param1,
          param2: binding.param2,
        })),
      }),
    );
    downloadFile("keymap-export.keymap", generateKeymapDtsi(layers), "text/plain");
  }, [keymap]);

  // --- Snapshots ---

  const [snapshots, setSnapshots] = useState<KeymapSnapshot[]>(() =>
    listSnapshots(window.localStorage),
  );
  const [snapshotNote, setSnapshotNote] = useState("");
  const [diffBeforeId, setDiffBeforeId] = useState("");
  const [diffAfterId, setDiffAfterId] = useState("");

  const handleTakeSnapshot = useCallback(() => {
    if (!keymap.keymap) return;
    addSnapshot(window.localStorage, {
      note: snapshotNote.trim(),
      deviceName: connection.deviceName || "",
      layers: keymap.keymap.layers.map((layer, layerIndex) => ({
        name: layer.name || `Layer ${layerIndex}`,
        bindings: layer.bindings.map((binding, position) => ({
          behaviorId: binding.behaviorId,
          behaviorName:
            keymap.getBehavior(binding.behaviorId)?.displayName ?? "",
          param1: binding.param1,
          param2: binding.param2,
          label: labelForBinding(layerIndex, position),
        })),
      })),
    });
    setSnapshots(listSnapshots(window.localStorage));
    setSnapshotNote("");
  }, [keymap, snapshotNote, connection.deviceName, labelForBinding]);

  const handleRemoveSnapshot = useCallback((id: string) => {
    removeSnapshot(window.localStorage, id);
    setSnapshots(listSnapshots(window.localStorage));
  }, []);

  const diffEntries = useMemo(() => {
    const before = snapshots.find((snapshot) => snapshot.id === diffBeforeId);
    const after = snapshots.find((snapshot) => snapshot.id === diffAfterId);
    if (!before || !after) return null;
    return diffSnapshots(before, after);
  }, [snapshots, diffBeforeId, diffAfterId]);

  // --- Typing trainer ---

  const [drill, setDrill] = useState(() =>
    pickDrill(DEFAULT_DRILL_WORDS, DRILL_WORD_COUNT),
  );
  const [typed, setTyped] = useState("");
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [finishedResult, setFinishedResult] = useState<{
    wpm: number;
    accuracy: number;
  } | null>(null);

  const handleTypedChange = (value: string) => {
    if (finishedResult) return;
    const startMs = startedAtMs ?? Date.now();
    if (startedAtMs === null && value.length > 0) {
      setStartedAtMs(startMs);
    }
    setTyped(value);
    const evaluation = evaluateTyping(drill, value);
    if (evaluation.completed) {
      const elapsedMs = Date.now() - startMs;
      setFinishedResult({
        wpm: computeWpm(evaluation.correctChars, elapsedMs),
        accuracy: evaluation.accuracy,
      });
    }
  };

  const handleNextDrill = () => {
    setDrill(pickDrill(DEFAULT_DRILL_WORDS, DRILL_WORD_COUNT));
    setTyped("");
    setStartedAtMs(null);
    setFinishedResult(null);
  };

  const liveEvaluation = evaluateTyping(drill, typed);

  // --- Macro recorder ---

  const [isRecording, setIsRecording] = useState(false);
  const [recordedEvents, setRecordedEvents] = useState<RecordedKeyEvent[]>([]);
  const [includeDelays, setIncludeDelays] = useState(false);
  const [targetSlot, setTargetSlot] = useState("");
  const [isAppending, setIsAppending] = useState(false);
  const [recorderMessage, setRecorderMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isRecording) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === "Escape") {
        event.preventDefault();
        setIsRecording(false);
        return;
      }
      if (hidUsageForEventCode(event.code) === null) return;
      event.preventDefault();
      if (event.repeat) return;
      setRecordedEvents((events) => [
        ...events,
        { code: event.code, kind: "down", timeMs: performance.now() },
      ]);
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (hidUsageForEventCode(event.code) === null) return;
      event.preventDefault();
      setRecordedEvents((events) => [
        ...events,
        { code: event.code, kind: "up", timeMs: performance.now() },
      ]);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [isRecording]);

  const recorderSteps = useMemo(
    () => buildRecorderSteps(recordedEvents, { includeDelays }),
    [recordedEvents, includeDelays],
  );

  const handleAppendToMacro = useCallback(async () => {
    const slot = Number(targetSlot);
    if (targetSlot === "" || Number.isNaN(slot) || recorderSteps.length === 0) {
      return;
    }
    const keyPressBehaviorId =
      runtimeMacro.globalSettings?.keyPressBehaviorId ||
      getKeyPressBehaviorId(keymap.behaviors);
    if (!keyPressBehaviorId) {
      setRecorderMessage(
        tr(
          "Key Press behavior was not found on the keyboard.",
          "キーボード上でKey Pressビヘイビアが見つかりませんでした。",
        ),
      );
      return;
    }
    setIsAppending(true);
    try {
      await runtimeMacro.getMacro(slot);
      for (const step of recorderSteps) {
        if (step.action === "delay") {
          await runtimeMacro.appendMacroStep(slot, {
            delay: { delayMs: step.delayMs ?? 0 },
          });
          continue;
        }
        const binding = {
          behaviorId: keyPressBehaviorId,
          param1: step.param ?? 0,
          param2: 0,
        };
        if (step.action === "tap") {
          await runtimeMacro.appendMacroStep(slot, { tap: binding });
        } else if (step.action === "down") {
          await runtimeMacro.appendMacroStep(slot, { down: binding });
        } else {
          await runtimeMacro.appendMacroStep(slot, { up: binding });
        }
      }
      setRecordedEvents([]);
      setRecorderMessage(
        tr(
          "Recorded steps appended (unsaved). Use Save below or the Macro&Combo tab.",
          "録画したステップを追加しました（未保存）。下の保存ボタンかMacro&Comboタブから保存してください。",
        ),
      );
    } finally {
      setIsAppending(false);
    }
  }, [targetSlot, recorderSteps, runtimeMacro, keymap.behaviors, tr]);

  // --- Render ---

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
            <IconChartBar size={24} className="text-[var(--color-electric)]" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-[var(--color-text)]">
              {tr("Insights", "インサイト")}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {tr(
                "Usage heatmap, cheat sheet, keymap history, typing practice and macro recording",
                "打鍵ヒートマップ・チートシート・キーマップ履歴・タイピング練習・マクロ録画",
              )}
            </p>
          </div>
        </div>

        {!connection.isConnected && (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">
              {tr(
                "Connect your keyboard to use Insights features",
                "Insights機能を使うにはキーボードを接続してください",
              )}
            </p>
          </div>
        )}

        {connection.isConnected && (
          <div className="space-y-4">
            {/* Heatmap & layer statistics */}
            <section className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconFlame size={18} className="text-[var(--color-electric)]" />
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Key usage heatmap", "打鍵ヒートマップ")}
                </h2>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    className="btn-ghost text-sm"
                    onClick={handleResetStats}
                    disabled={stats.totalPresses === 0}
                  >
                    {tr("Reset stats", "統計をリセット")}
                  </button>
                  <button
                    className="btn-electric text-sm"
                    onClick={() => void inputStream.toggleStream()}
                    disabled={!inputStream.isAvailable || inputStream.isToggling}
                  >
                    {inputStream.isEnabled
                      ? tr("Stop collecting", "計測を停止")
                      : tr("Start collecting", "計測を開始")}
                  </button>
                </div>
              </div>

              {!inputStream.isAvailable && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {tr(
                    "Input stream subsystem is not available in this firmware.",
                    "このファームウェアでは入力ストリームサブシステムが利用できません。",
                  )}
                </p>
              )}

              {inputStream.isAvailable && (
                <p className="text-xs text-[var(--color-text-muted)] mb-3">
                  {tr(
                    "Counts key presses while collection is enabled (stored locally in this browser).",
                    "計測中の打鍵をカウントします（このブラウザのローカルに保存）。",
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
                    const count = stats.countsByPosition[String(position)] ?? 0;
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
                          fill={heatColor(heatLevel(count, maxCount))}
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

              <div className="grid grid-cols-1 tablet:grid-cols-2 gap-4 mt-4">
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                    {tr("Layer usage", "レイヤー使用率")} ({stats.totalPresses}{" "}
                    {tr("presses", "打鍵")})
                  </h3>
                  {shares.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {tr("No data yet.", "まだデータがありません。")}
                    </p>
                  )}
                  <div className="space-y-1.5">
                    {shares.map(({ layerIndex, count, share }) => (
                      <div key={layerIndex} className="flex items-center gap-2">
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
                        <span className="text-xs w-16 text-right text-[var(--color-text-muted)]">
                          {count} ({Math.round(share * 100)}%)
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                    {tr("Top keys", "打鍵の多いキー")}
                  </h3>
                  {topKeys.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {tr("No data yet.", "まだデータがありません。")}
                    </p>
                  )}
                  <ol className="space-y-1">
                    {topKeys.map(({ position, count }) => (
                      <li
                        key={position}
                        className="text-sm text-[var(--color-text-secondary)] flex items-center gap-2"
                      >
                        <span className="font-mono text-xs text-[var(--color-text-muted)]">
                          #{position}
                        </span>
                        <span className="flex-1 truncate">
                          {labelForBinding(0, position) || "—"}
                        </span>
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {count}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </section>

            {/* Cheat sheet & dtsi export */}
            <section className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconDownload
                  size={18}
                  className="text-[var(--color-electric)]"
                />
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Export", "エクスポート")}
                </h2>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mb-3">
                {tr(
                  "Download a printable cheat sheet of all layers, or export the current keymap as a ZMK devicetree snippet.",
                  "全レイヤーの印刷用チートシートや、現在のキーマップのZMK devicetree（keymap）ファイルをダウンロードできます。",
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-electric text-sm flex items-center gap-1.5"
                  onClick={handleDownloadCheatsheetSvg}
                  disabled={!keymap.keymap || !activeLayout}
                >
                  <IconDownload size={16} />
                  {tr("Cheat sheet (SVG)", "チートシート (SVG)")}
                </button>
                <button
                  className="btn-ghost text-sm flex items-center gap-1.5"
                  onClick={handleDownloadCheatsheetPng}
                  disabled={!keymap.keymap || !activeLayout}
                >
                  <IconDownload size={16} />
                  {tr("Cheat sheet (PNG)", "チートシート (PNG)")}
                </button>
                <button
                  className="btn-ghost text-sm flex items-center gap-1.5"
                  onClick={handleDownloadDtsi}
                  disabled={!keymap.keymap}
                >
                  <IconDownload size={16} />
                  {tr("ZMK keymap (.keymap)", "ZMKキーマップ (.keymap)")}
                </button>
              </div>
            </section>

            {/* Snapshots */}
            <section className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconHistory
                  size={18}
                  className="text-[var(--color-electric)]"
                />
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Keymap snapshots", "キーマップスナップショット")}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input
                  type="text"
                  value={snapshotNote}
                  onChange={(event) => setSnapshotNote(event.target.value)}
                  placeholder={tr("Note (optional)", "メモ（任意）")}
                  className="px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] flex-1 min-w-[180px]"
                />
                <button
                  className="btn-electric text-sm flex items-center gap-1.5"
                  onClick={handleTakeSnapshot}
                  disabled={!keymap.keymap}
                >
                  <IconCamera size={16} />
                  {tr("Take snapshot", "スナップショットを保存")}
                </button>
              </div>

              {snapshots.length === 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {tr(
                    "No snapshots yet. Snapshots are stored locally in this browser.",
                    "スナップショットはまだありません。スナップショットはこのブラウザのローカルに保存されます。",
                  )}
                </p>
              )}

              {snapshots.length > 0 && (
                <div className="space-y-1 mb-4">
                  {snapshots.map((snapshot) => (
                    <div
                      key={snapshot.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]"
                    >
                      <span className="text-xs font-mono text-[var(--color-text-muted)]">
                        {new Date(snapshot.savedAt).toLocaleString()}
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)] truncate flex-1">
                        {snapshot.note ||
                          tr("(no note)", "（メモなし）")}
                      </span>
                      <button
                        className="p-1 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                        onClick={() => handleRemoveSnapshot(snapshot.id)}
                        title={tr("Delete snapshot", "スナップショットを削除")}
                      >
                        <IconTrash size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {snapshots.length >= 2 && (
                <div>
                  <h3 className="text-xs font-medium text-[var(--color-text-muted)] mb-2">
                    {tr("Compare snapshots", "スナップショットを比較")}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={diffBeforeId}
                      onChange={(event) => setDiffBeforeId(event.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
                    >
                      <option value="">{tr("Before...", "比較元...")}</option>
                      {snapshots.map((snapshot) => (
                        <option key={snapshot.id} value={snapshot.id}>
                          {new Date(snapshot.savedAt).toLocaleString()}{" "}
                          {snapshot.note}
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-[var(--color-text-muted)]">→</span>
                    <select
                      value={diffAfterId}
                      onChange={(event) => setDiffAfterId(event.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
                    >
                      <option value="">{tr("After...", "比較先...")}</option>
                      {snapshots.map((snapshot) => (
                        <option key={snapshot.id} value={snapshot.id}>
                          {new Date(snapshot.savedAt).toLocaleString()}{" "}
                          {snapshot.note}
                        </option>
                      ))}
                    </select>
                  </div>
                  {diffEntries && diffEntries.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {tr("No differences.", "差分はありません。")}
                    </p>
                  )}
                  {diffEntries && diffEntries.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-[var(--color-text-muted)]">
                            <th className="py-1 pr-3">{tr("Layer", "レイヤー")}</th>
                            <th className="py-1 pr-3">{tr("Key", "キー")}</th>
                            <th className="py-1 pr-3">{tr("Before", "変更前")}</th>
                            <th className="py-1">{tr("After", "変更後")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffEntries.map((entry, index) => (
                            <tr
                              key={index}
                              className="border-t border-[var(--color-border)] text-[var(--color-text-secondary)]"
                            >
                              <td className="py-1 pr-3">{entry.layerName}</td>
                              <td className="py-1 pr-3 font-mono text-xs">
                                #{entry.position}
                              </td>
                              <td className="py-1 pr-3">
                                {entry.before ?? tr("(none)", "（なし）")}
                              </td>
                              <td className="py-1 text-[var(--color-electric)]">
                                {entry.after ?? tr("(none)", "（なし）")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Typing trainer */}
            <section className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconKeyboard
                  size={18}
                  className="text-[var(--color-electric)]"
                />
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Typing practice", "タイピング練習")}
                </h2>
                <button
                  className="btn-ghost text-sm flex items-center gap-1.5 ml-auto"
                  onClick={handleNextDrill}
                >
                  <IconRefresh size={16} />
                  {tr("New drill", "新しいお題")}
                </button>
              </div>
              <p className="font-mono text-base mb-3 leading-relaxed">
                {drill.split("").map((char, index) => {
                  const typedChar = typed[index];
                  const className =
                    typedChar === undefined
                      ? "text-[var(--color-text-muted)]"
                      : typedChar === char
                        ? "text-[var(--color-electric)]"
                        : "text-red-400 underline";
                  return (
                    <span key={index} className={className}>
                      {char}
                    </span>
                  );
                })}
              </p>
              <input
                type="text"
                value={typed}
                onChange={(event) => handleTypedChange(event.target.value)}
                placeholder={tr(
                  "Type the text above with your keyboard...",
                  "自作キーボードで上のテキストを入力...",
                )}
                disabled={finishedResult !== null}
                className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-mono text-[var(--color-text)]"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <div className="flex flex-wrap gap-4 mt-3 text-sm text-[var(--color-text-secondary)]">
                {finishedResult ? (
                  <>
                    <span>
                      WPM:{" "}
                      <span className="text-[var(--color-electric)] font-medium">
                        {finishedResult.wpm.toFixed(1)}
                      </span>
                    </span>
                    <span>
                      {tr("Accuracy", "正確率")}:{" "}
                      <span className="text-[var(--color-electric)] font-medium">
                        {(finishedResult.accuracy * 100).toFixed(1)}%
                      </span>
                    </span>
                    <span className="text-[var(--color-neon)]">
                      {tr("Completed!", "完了！")}
                    </span>
                  </>
                ) : (
                  <>
                    <span>
                      {tr("Progress", "進捗")}: {liveEvaluation.correctChars}/
                      {liveEvaluation.targetLength}
                    </span>
                    <span>
                      {tr("Errors", "ミス")}: {liveEvaluation.errorCount}
                    </span>
                  </>
                )}
              </div>
            </section>

            {/* Macro recorder */}
            <section className="glass-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <IconWand size={18} className="text-[var(--color-electric)]" />
                <h2 className="text-sm font-medium text-[var(--color-text)]">
                  {tr("Macro recorder", "マクロ録画")}
                </h2>
              </div>

              {!runtimeMacro.isAvailable && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {tr(
                    "Runtime macro subsystem is not available in this firmware.",
                    "このファームウェアではruntime macroサブシステムが利用できません。",
                  )}
                </p>
              )}

              {runtimeMacro.isAvailable && (
                <>
                  <p className="text-xs text-[var(--color-text-muted)] mb-3">
                    {tr(
                      "Record keys typed in this browser window and append them to a runtime macro slot. Press Esc to stop recording.",
                      "このブラウザウィンドウでのキー入力を録画し、runtime macroのスロットに追記します。Escキーで録画を停止します。",
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <select
                      value={targetSlot}
                      onChange={(event) => setTargetSlot(event.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)]"
                      disabled={isRecording || isAppending}
                    >
                      <option value="">
                        {tr("Select macro...", "マクロを選択...")}
                      </option>
                      {runtimeMacro.macros.map((macro) => (
                        <option key={macro.slot} value={macro.slot}>
                          {macro.name || `Macro ${macro.slot}`}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                      <input
                        type="checkbox"
                        checked={includeDelays}
                        onChange={(event) =>
                          setIncludeDelays(event.target.checked)
                        }
                        disabled={isRecording || isAppending}
                      />
                      {tr("Record delays", "遅延も記録")}
                    </label>
                    {isRecording ? (
                      <button
                        className="btn-electric text-sm flex items-center gap-1.5"
                        onClick={() => setIsRecording(false)}
                      >
                        <IconPlayerStop size={16} />
                        {tr("Stop", "停止")}
                      </button>
                    ) : (
                      <button
                        className="btn-electric text-sm flex items-center gap-1.5"
                        onClick={() => {
                          setRecordedEvents([]);
                          setRecorderMessage(null);
                          setIsRecording(true);
                        }}
                        disabled={isAppending}
                      >
                        <IconPlayerRecord size={16} />
                        {tr("Start recording", "録画開始")}
                      </button>
                    )}
                    <button
                      className="btn-ghost text-sm"
                      onClick={() => void handleAppendToMacro()}
                      disabled={
                        isRecording ||
                        isAppending ||
                        targetSlot === "" ||
                        recorderSteps.length === 0
                      }
                    >
                      {isAppending
                        ? tr("Appending...", "追記中...")
                        : tr("Append to macro", "マクロに追記")}
                    </button>
                    {runtimeMacro.hasUnsavedChanges && (
                      <button
                        className="btn-electric text-sm"
                        onClick={() => void runtimeMacro.saveMacros()}
                        disabled={isRecording || isAppending}
                      >
                        {tr("Save to keyboard", "キーボードに保存")}
                      </button>
                    )}
                  </div>

                  {isRecording && (
                    <p className="text-sm text-[var(--color-neon)] mb-2 animate-pulse">
                      {tr("Recording...", "録画中...")} (
                      {recordedEvents.length}{" "}
                      {tr("events", "イベント")})
                    </p>
                  )}

                  {recorderMessage && (
                    <p className="text-sm text-[var(--color-electric)] mb-2">
                      {recorderMessage}
                    </p>
                  )}

                  {runtimeMacro.macros.length === 0 && (
                    <p className="text-sm text-[var(--color-text-muted)] mb-2">
                      {tr(
                        "No macros yet — create one in the Macro&Combo tab first.",
                        "マクロがまだありません。先にMacro&Comboタブで作成してください。",
                      )}
                    </p>
                  )}

                  {!isRecording && recorderSteps.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {recorderSteps.map((step, index) => (
                        <span
                          key={index}
                          className="px-2 py-0.5 rounded bg-[var(--color-border)] text-xs font-mono text-[var(--color-text-secondary)]"
                        >
                          {step.action === "delay"
                            ? `${step.delayMs}ms`
                            : `${step.action}:${step.code ?? ""}`}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
