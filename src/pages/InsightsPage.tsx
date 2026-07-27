/**
 * Insights page: feature-parity additions inspired by other keymap tools.
 * - Key usage heatmap & layer statistics (Oryx-style)
 * - Battery history recorded on the keyboard (zmk-module-battery-history)
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
import { BatteryHistorySection } from "../components/BatteryHistorySection";
import { KeyboardLayoutContext } from "../contexts/KeyboardLayoutContext";
import { useKeymap } from "../hooks/useKeymap";
import { useLanguage } from "../hooks/useLanguage";
import { useInputStream } from "../hooks/useInputStream";
import { useRuntimeMacro } from "../hooks/useRuntimeMacro";
import { useLiveKeyUsageStats } from "../hooks/useLiveKeyUsageStats";
import { formatComboBehavior } from "../components/macroCombo/comboUtils";
import { getKeyPressBehaviorId } from "../components/macroCombo/macroStepUtils";
import { buildCheatsheetSvg, type CheatsheetLayer } from "../lib/cheatsheetSvg";
import { generateKeymapDtsi, type DtsiLayer } from "../lib/keymapDtsiExport";
import { heatColor, heatLevel } from "../lib/keyUsageStats";
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
  // Recording is centralized in useLiveKeyUsageStats/liveKeyUsageStore so the
  // Keymap tab's own insights panel (which keeps its own useInputStream()
  // subscription) can show the same live heatmap without double-counting
  // presses when both tabs are streaming at once (tabs stay mounted — see
  // TabNavigation).
  const {
    stats,
    maxCount,
    shares,
    topKeys,
    resetStats: handleResetStats,
  } = useLiveKeyUsageStats(
    inputStream.highlightedKeys,
    inputStream.activeLayerIndex,
    inputStream.isEnabled,
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
    const startMs = startedAtMs ??