/**
 * 打鍵統計のエクスポート（JSON / CSV / AI向けMarkdown）。
 *
 * KeyUsagePage から呼び出される純粋関数群。デバイス通信やReactには依存しない
 * ため、そのままユニットテストできる。
 *
 * 目的: キーボードに蓄積された打鍵カウンタを、AIや表計算ソフトに渡して
 * 「どのキーをどれだけ打っているか」「キーマップは最適か」を分析できる形で
 * 書き出す。
 */

export interface KeyUsageExportMetadata {
  totalPresses: number;
  maxLayers: number;
  maxPositions: number;
  maxKeycode: number;
}

export interface KeyUsageExportPositionEntry {
  layer: number;
  position: number;
  count: number;
}

export interface KeyUsageExportKeycodeEntry {
  usagePage: number;
  keycode: number;
  count: number;
}

export interface KeyUsageExportKeyGeometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface KeyUsageExportInput {
  metadata: KeyUsageExportMetadata;
  /** 読み出し時刻（ミリ秒） */
  fetchedAt: number;
  positions: readonly KeyUsageExportPositionEntry[];
  keycodes: readonly KeyUsageExportKeycodeEntry[];
  /** レイヤー番号順の名前。無い場合は "Layer N" になる。 */
  layerNames?: readonly string[];
  /** 物理レイアウト上の位置（キー位置インデックス順）。単位はキー単位(1.0=1u)。 */
  keyGeometry?: readonly (KeyUsageExportKeyGeometry | undefined)[];
  /** keyBindings[layer][position] = そのキーに割り当てられている表示名 */
  keyBindings?: readonly (readonly (string | undefined)[])[];
  /** キーコードの表示名を解決する関数 */
  keycodeLabel?: (usagePage: number, keycode: number) => string;
  deviceName?: string;
}

export interface KeyUsageLayerTotal {
  layer: number;
  name: string;
  count: number;
  share: number;
}

export interface KeyUsagePositionRow {
  layer: number;
  layerName: string;
  position: number;
  keyLabel?: string;
  geometry?: KeyUsageExportKeyGeometry;
  count: number;
  share: number;
}

export interface KeyUsageKeycodeRow {
  usagePage: number;
  keycode: number;
  label: string;
  count: number;
  share: number;
}

export const KEY_USAGE_EXPORT_SCHEMA_VERSION = 1;

/** Markdownに載せるキーコードランキングの件数 */
export const MARKDOWN_TOP_KEYCODES = 40;
/** Markdownに載せるキー別カウントの件数 */
export const MARKDOWN_TOP_POSITIONS = 200;

function layerNameOf(input: KeyUsageExportInput, layer: number): string {
  const name = input.layerNames?.[layer];
  return name && name.length > 0 ? name : `Layer ${layer}`;
}

function labelOf(
  input: KeyUsageExportInput,
  usagePage: number,
  keycode: number,
): string {
  if (input.keycodeLabel) return input.keycodeLabel(usagePage, keycode);
  return `0x${keycode.toString(16).toUpperCase()}`;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeLayerTotals(
  input: KeyUsageExportInput,
): KeyUsageLayerTotal[] {
  const totals = new Map<number, number>();
  let sum = 0;
  for (const entry of input.positions) {
    totals.set(entry.layer, (totals.get(entry.layer) ?? 0) + entry.count);
    sum += entry.count;
  }
  return [...totals.entries()]
    .map(([layer, count]) => ({
      layer,
      name: layerNameOf(input, layer),
      count,
      share: sum > 0 ? count / sum : 0,
    }))
    .sort((a, b) => a.layer - b.layer);
}

export function computePositionRows(
  input: KeyUsageExportInput,
): KeyUsagePositionRow[] {
  const sum = input.positions.reduce((acc, entry) => acc + entry.count, 0);
  return [...input.positions]
    .map((entry) => ({
      layer: entry.layer,
      layerName: layerNameOf(input, entry.layer),
      position: entry.position,
      keyLabel: input.keyBindings?.[entry.layer]?.[entry.position],
      geometry: input.keyGeometry?.[entry.position],
      count: entry.count,
      share: sum > 0 ? entry.count / sum : 0,
    }))
    .sort((a, b) => b.count - a.count || a.layer - b.layer || a.position - b.position);
}

export function computeKeycodeRows(
  input: KeyUsageExportInput,
): KeyUsageKeycodeRow[] {
  const sum = input.keycodes.reduce((acc, entry) => acc + entry.count, 0);
  return [...input.keycodes]
    .map((entry) => ({
      usagePage: entry.usagePage,
      keycode: entry.keycode,
      label: labelOf(input, entry.usagePage, entry.keycode),
      count: entry.count,
      share: sum > 0 ? entry.count / sum : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

/** 機械可読なJSON。AIにも表計算にも渡せる、いちばん情報量が多い形式。 */
export function buildKeyUsageJson(input: KeyUsageExportInput): string {
  const layerTotals = computeLayerTotals(input);
  const positionRows = computePositionRows(input);
  const keycodeRows = computeKeycodeRows(input);

  const payload = {
    schema: "dya-studio/key-usage",
    schemaVersion: KEY_USAGE_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    readAt: new Date(input.fetchedAt).toISOString(),
    device: input.deviceName ?? null,
    metadata: {
      totalPresses: input.metadata.totalPresses,
      maxLayers: input.metadata.maxLayers,
      maxPositions: input.metadata.maxPositions,
      maxKeycode: input.metadata.maxKeycode,
      trackedKeyEntries: input.positions.length,
      trackedKeycodeEntries: input.keycodes.length,
    },
    layers: layerTotals.map((total) => ({
      layer: total.layer,
      name: total.name,
      count: total.count,
      share: round(total.share, 5),
    })),
    positions: positionRows.map((row) => ({
      layer: row.layer,
      layerName: row.layerName,
      position: row.position,
      key: row.keyLabel ?? null,
      count: row.count,
      share: round(row.share, 5),
      geometry: row.geometry
        ? {
            x: round(row.geometry.x, 3),
            y: round(row.geometry.y, 3),
            width: round(row.geometry.width, 3),
            height: round(row.geometry.height, 3),
          }
        : null,
    })),
    keycodes: keycodeRows.map((row) => ({
      usagePage: row.usagePage,
      keycode: row.keycode,
      keycodeHex: `0x${row.keycode.toString(16).toUpperCase()}`,
      label: row.label,
      count: row.count,
      share: round(row.share, 5),
    })),
  };

  return `${JSON.stringify(payload, null, 2)}\n`;
}

function escapeCsv(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * 1ファイルで完結するCSV。kind列で position / keycode の2種類の行を区別する。
 * Excelでも読めるようにBOMは付けず、改行はCRLFにする。
 */
export function buildKeyUsageCsv(input: KeyUsageExportInput): string {
  const header = [
    "kind",
    "layer",
    "layer_name",
    "position",
    "key",
    "x",
    "y",
    "width",
    "height",
    "usage_page",
    "keycode",
    "keycode_hex",
    "label",
    "count",
    "share_percent",
  ];

  const lines: string[] = [header.join(",")];

  for (const row of computePositionRows(input)) {
    lines.push(
      [
        "position",
        row.layer,
        escapeCsv(row.layerName),
        row.position,
        escapeCsv(row.keyLabel),
        row.geometry ? round(row.geometry.x, 3) : "",
        row.geometry ? round(row.geometry.y, 3) : "",
        row.geometry ? round(row.geometry.width, 3) : "",
        row.geometry ? round(row.geometry.height, 3) : "",
        "",
        "",
        "",
        "",
        row.count,
        round(row.share * 100, 3),
      ].join(","),
    );
  }

  for (const row of computeKeycodeRows(input)) {
    lines.push(
      [
        "keycode",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        row.usagePage,
        row.keycode,
        `0x${row.keycode.toString(16).toUpperCase()}`,
        escapeCsv(row.label),
        row.count,
        round(row.share * 100, 3),
      ].join(","),
    );
  }

  return `${lines.join("\r\n")}\r\n`;
}

/**
 * AIにそのまま貼り付けて分析させるためのMarkdown。
 * 数値の羅列だけでなく、何のデータかという文脈と分析観点も添える。
 */
export function buildKeyUsageMarkdown(input: KeyUsageExportInput): string {
  const layerTotals = computeLayerTotals(input);
  const positionRows = computePositionRows(input);
  const keycodeRows = computeKeycodeRows(input);
  const out: string[] = [];

  out.push("# Keyboard key usage statistics");
  out.push("");
  out.push(
    "This data was exported from DYA Studio. It is the cumulative key press counter stored in the keyboard firmware itself (it keeps counting while the configurator is closed and survives reboots).",
  );
  out.push("");
  if (input.deviceName) out.push(`- Device: ${input.deviceName}`);
  out.push(`- Read from keyboard at: ${new Date(input.fetchedAt).toISOString()}`);
  out.push(`- Total presses: ${input.metadata.totalPresses}`);
  out.push(
    `- Counter capacity: ${input.metadata.maxLayers} layers x ${input.metadata.maxPositions} key positions, keycodes up to 0x${input.metadata.maxKeycode.toString(16).toUpperCase()}`,
  );
  out.push(
    `- Recorded entries: ${input.positions.length} (layer, position) pairs, ${input.keycodes.length} keycodes`,
  );
  out.push("");

  out.push("## Layer usage");
  out.push("");
  if (layerTotals.length === 0) {
    out.push("_No data._");
  } else {
    out.push("| Layer | Name | Presses | Share |");
    out.push("| ---: | --- | ---: | ---: |");
    for (const total of layerTotals) {
      out.push(
        `| ${total.layer} | ${total.name} | ${total.count} | ${round(total.share * 100, 1)}% |`,
      );
    }
  }
  out.push("");

  out.push(`## Most typed keys (top ${MARKDOWN_TOP_KEYCODES})`);
  out.push("");
  if (keycodeRows.length === 0) {
    out.push(
      "_No keycode data. Keycode tracking requires CONFIG_ZMK_KEY_USAGE_TRACK_KEYCODES=y._",
    );
  } else {
    out.push("| # | Key | Presses | Share |");
    out.push("| ---: | --- | ---: | ---: |");
    keycodeRows.slice(0, MARKDOWN_TOP_KEYCODES).forEach((row, index) => {
      out.push(
        `| ${index + 1} | ${row.label} | ${row.count} | ${round(row.share * 100, 1)}% |`,
      );
    });
  }
  out.push("");

  out.push(`## Per-key counts (top ${MARKDOWN_TOP_POSITIONS})`);
  out.push("");
  out.push(
    "`position` is the physical key index used by the keymap. `x`/`y` are the physical coordinates in key units (1.0 = 1u), origin at the top-left of the board.",
  );
  out.push("");
  if (positionRows.length === 0) {
    out.push("_No data._");
  } else {
    out.push("| Layer | Position | Key | x | y | Presses | Share |");
    out.push("| --- | ---: | --- | ---: | ---: | ---: | ---: |");
    for (const row of positionRows.slice(0, MARKDOWN_TOP_POSITIONS)) {
      out.push(
        `| ${row.layerName} | ${row.position} | ${row.keyLabel ?? "-"} | ${
          row.geometry ? round(row.geometry.x, 2) : "-"
        } | ${row.geometry ? round(row.geometry.y, 2) : "-"} | ${row.count} | ${round(row.share * 100, 2)}% |`,
      );
    }
    if (positionRows.length > MARKDOWN_TOP_POSITIONS) {
      out.push("");
      out.push(
        `_${positionRows.length - MARKDOWN_TOP_POSITIONS} more rows omitted. Use the JSON or CSV export for the full data set._`,
      );
    }
  }
  out.push("");

  out.push("## What I would like analysed");
  out.push("");
  out.push("1. Which keys and layers carry the heaviest load, and is that load balanced between hands and fingers?");
  out.push("2. Are frequently used keys sitting in hard-to-reach positions? Suggest concrete swaps.");
  out.push("3. Are there layers or keys that are almost never used and could be repurposed?");
  out.push("4. Any signs of awkward combinations (e.g. heavy pinky usage, frequent same-finger sequences)?");
  out.push("");

  return `${out.join("\n")}\n`;
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

export function keyUsageExportFilename(
  extension: "json" | "csv" | "md",
  fetchedAt: number,
): string {
  const date = new Date(fetchedAt);
  const stamp = `${date.getFullYear()}${twoDigits(date.getMonth() + 1)}${twoDigits(
    date.getDate(),
  )}-${twoDigits(date.getHours())}${twoDigits(date.getMinutes())}`;
  return `key-usage-${stamp}.${extension}`;
}

/** ブラウザでテキストファイルとしてダウンロードさせる。 */
export function downloadTextFile(
  filename: string,
  text: string,
  mimeType: string,
): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** クリップボードへコピー。失敗時は false を返す（HTTPS以外や権限拒否）。 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // フォールバックへ
  }
  try {
    if (typeof document === "undefined") return false;
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
