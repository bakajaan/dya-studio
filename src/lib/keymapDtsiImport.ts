/**
 * ZMK devicetree (.keymap / .dtsi) の keymap ノードを読み込み、DYA Studio の
 * キーマップに書き戻せる形（KeymapProfile）へ変換する。
 * keymapDtsiExport.ts の逆変換にあたり、zmk-keymap-common などリポジトリ側で
 * 管理しているキーマップを実機へ流し込む（双方向同期）ために使う。
 *
 * 方針:
 * - 未知のビヘイビア・キーコードは捨てずに warning として返し、適用時に
 *   buildApplyPlan 側の skippedBehaviors で拾えるよう名前をそのまま残す。
 * - キーコード名のテーブルはエクスポート側と二重管理したくないので、
 *   formatZmkKeycode() を総当たりして逆引き表を作る。
 */
import { formatZmkKeycode } from "./keymapDtsiExport";
import type { KeymapProfile, ProfileLayer } from "./keymapProfile";

const KEYBOARD_PAGE = 0x07;
const CONSUMER_PAGE = 0x0c;

const MODIFIER_BITS: Record<string, number> = {
  LC: 0x01,
  LS: 0x02,
  LA: 0x04,
  LG: 0x08,
  RC: 0x10,
  RS: 0x20,
  RA: 0x40,
  RG: 0x80,
};

let keycodeTable: Map<string, number> | null = null;

/** 名前 -> キーコード値（(page << 16) | usage）の逆引き表を遅延生成する。 */
function getKeycodeTable(): Map<string, number> {
  if (keycodeTable) return keycodeTable;
  const table = new Map<string, number>();
  const add = (param: number): void => {
    const name = formatZmkKeycode(param);
    if (name.startsWith("0x")) return;
    if (!table.has(name)) table.set(name, param);
  };
  for (let usage = 0; usage <= 0xff; usage += 1) {
    add((KEYBOARD_PAGE << 16) | usage);
  }
  for (let usage = 0; usage <= 0x2ff; usage += 1) {
    add((CONSUMER_PAGE << 16) | usage);
  }
  keycodeTable = table;
  return table;
}

const BT_VALUES: Record<string, number> = {
  BT_CLR: 0,
  BT_NXT: 1,
  BT_PRV: 2,
  BT_SEL: 3,
  BT_CLR_ALL: 4,
  BT_DISC: 5,
};

const OUT_VALUES: Record<string, number> = {
  OUT_TOG: 0,
  OUT_USB: 1,
  OUT_BLE: 2,
};

const MOUSE_BUTTON_VALUES: Record<string, number> = {
  MB1: 1,
  LCLK: 1,
  MB2: 2,
  RCLK: 2,
  MB3: 4,
  MCLK: 4,
  MB4: 8,
  MB5: 16,
};

type ParamKind = "keycode" | "layer" | "number" | "bt" | "out" | "mouse";

interface BehaviorSpec {
  /** DYA Studio / ZMK Studio 上の表示名（ProfileBinding.behavior に入る） */
  displayName: string;
  params: ParamKind[];
}

const BEHAVIOR_SPECS: Record<string, BehaviorSpec> = {
  kp: { displayName: "Key Press", params: ["keycode"] },
  mo: { displayName: "Momentary Layer", params: ["layer"] },
  to: { displayName: "To Layer", params: ["layer"] },
  tog: { displayName: "Toggle Layer", params: ["layer"] },
  lt: { displayName: "Layer-Tap", params: ["layer", "keycode"] },
  mt: { displayName: "Mod-Tap", params: ["keycode", "keycode"] },
  trans: { displayName: "Trans", params: [] },
  none: { displayName: "None", params: [] },
  sk: { displayName: "Sticky Key", params: ["keycode"] },
  sl: { displayName: "Sticky Layer", params: ["layer"] },
  caps_word: { displayName: "Caps Word", params: [] },
  key_repeat: { displayName: "Key Repeat", params: [] },
  kt: { displayName: "Key Toggle", params: ["keycode"] },
  bootloader: { displayName: "Bootloader", params: [] },
  sys_reset: { displayName: "System Reset", params: [] },
  gresc: { displayName: "Grave/Escape", params: [] },
  studio_unlock: { displayName: "Studio Unlock", params: [] },
  rmacro: { displayName: "Runtime Macro", params: ["number"] },
  mkp: { displayName: "Mouse Key Press", params: ["mouse"] },
  bt: { displayName: "Bluetooth", params: ["bt", "number"] },
  out: { displayName: "Output Selection", params: ["out"] },
};

export interface ImportedBinding {
  /** 表示名（未知のビヘイビアの場合は dtsi 上のノード名） */
  behavior: string;
  param1: number;
  param2: number;
  /** 元の記述（"&kp LC(A)" など） */
  raw: string;
  /** 解釈できなかった場合に理由が入る */
  warning?: string;
}

export interface ImportedLayer {
  /** devicetree のノード名 */
  nodeName: string;
  /** display-name プロパティ（無ければノード名） */
  displayName: string;
  bindings: ImportedBinding[];
}

export interface DtsiImportResult {
  layers: ImportedLayer[];
  warnings: string[];
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
}

/** keymap ノードの中身だけを取り出す（見つからなければ全体を返す）。 */
export function extractKeymapSection(source: string): string {
  const marker = source.search(/compatible\s*=\s*"zmk,keymap"/);
  if (marker < 0) return source;
  const open = source.lastIndexOf("{", marker);
  if (open < 0) return source;
  let depth = 1;
  let index = open + 1;
  for (; index < source.length && depth > 0; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    else if (char === "}") depth -= 1;
  }
  return source.slice(open + 1, Math.max(open + 1, index - 1));
}

/** 括弧の深さを見ながら空白で区切る（LC(LS(A)) を壊さない）。 */
function splitTopLevel(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of text) {
    if (char === "(") depth += 1;
    if (char === ")") depth = Math.max(0, depth - 1);
    if (depth === 0 && /\s/.test(char)) {
      if (current) parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function parseNumber(token: string): number | null {
  const text = token.trim();
  if (/^0[xX][0-9a-fA-F]+$/.test(text)) return Number.parseInt(text, 16);
  if (/^-?\d+$/.test(text)) return Number.parseInt(text, 10);
  return null;
}

/** "LC(A)" や "0x07001E" などのキーコード表記を数値へ戻す。 */
export function parseZmkKeycode(token: string): number | null {
  const text = token.trim();
  const wrapper = /^([A-Z]{2})\((.*)\)$/.exec(text);
  if (wrapper) {
    const bit = MODIFIER_BITS[wrapper[1]];
    const inner = parseZmkKeycode(wrapper[2]);
    if (bit === undefined || inner === null) return null;
    return ((inner >>> 0) | (bit << 24)) >>> 0;
  }
  const numeric = parseNumber(text);
  if (numeric !== null) {
    // ページ指定の無い生の値はキーボードページとして解釈する。
    return numeric > 0xffff ? numeric : (KEYBOARD_PAGE << 16) | numeric;
  }
  return getKeycodeTable().get(text) ?? null;
}

function parseParam(kind: ParamKind, token: string | undefined): number | null {
  if (token === undefined) return null;
  switch (kind) {
    case "keycode":
      return parseZmkKeycode(token);
    case "layer":
    case "number":
      return parseNumber(token);
    case "bt":
      return BT_VALUES[token] ?? parseNumber(token);
    case "out":
      return OUT_VALUES[token] ?? parseNumber(token);
    case "mouse":
      return MOUSE_BUTTON_VALUES[token] ?? parseNumber(token);
    default:
      return null;
  }
}

export function parseBinding(raw: string): ImportedBinding {
  const text = raw.trim().replace(/^&/, "");
  const tokens = splitTopLevel(text);
  const name = tokens[0] ?? "";
  const spec = BEHAVIOR_SPECS[name];
  if (!spec) {
    return {
      behavior: name,
      param1: 0,
      param2: 0,
      raw: `&${text}`,
      warning: `未対応のビヘイビア: &${name}`,
    };
  }

  const values: number[] = [];
  let warning: string | undefined;
  spec.params.forEach((kind, index) => {
    const token = tokens[index + 1];
    // &bt BT_NXT のように後続パラメータが省略される場合がある。
    if (token === undefined) {
      values.push(0);
      return;
    }
    const value = parseParam(kind, token);
    if (value === null) {
      warning = `解釈できないパラメータ: ${token} (&${name})`;
      values.push(0);
      return;
    }
    values.push(value);
  });

  return {
    behavior: spec.displayName,
    param1: values[0] ?? 0,
    param2: values[1] ?? 0,
    raw: `&${text}`,
    warning,
  };
}

/** dtsi テキストからレイヤーとバインディングを取り出す。 */
export function parseKeymapDtsi(source: string): DtsiImportResult {
  const warnings: string[] = [];
  const section = extractKeymapSection(stripComments(source));
  const layers: ImportedLayer[] = [];

  const nodePattern = /([A-Za-z0-9_-]+)\s*\{([^{}]*?)\}/g;
  let match: RegExpExecArray | null;
  while ((match = nodePattern.exec(section)) !== null) {
    const nodeName = match[1];
    const body = match[2];
    const bindingsMatch = /bindings\s*=\s*<([\s\S]*?)>\s*;/.exec(body);
    if (!bindingsMatch) continue;

    const displayNameMatch = /display-name\s*=\s*"([^"]*)"/.exec(body);
    const rawBindings = bindingsMatch[1]
      .replace(/\s+/g, " ")
      .split("&")
      .map((part) => part.trim())
      .filter((part) => part.length > 0);

    const bindings = rawBindings.map((part) => parseBinding(part));
    for (const binding of bindings) {
      if (binding.warning) warnings.push(binding.warning);
    }

    layers.push({
      nodeName,
      displayName: displayNameMatch ? displayNameMatch[1] : nodeName,
      bindings,
    });
  }

  if (layers.length === 0) {
    warnings.push("keymap ノードが見つかりませんでした。");
  }

  return { layers, warnings };
}

/**
 * インポート結果を KeymapProfile に変換する。
 * 変換後は既存の buildApplyPlan() でそのまま実機へ適用できる。
 */
export function dtsiToProfile(
  result: DtsiImportResult,
  options: { name: string; deviceName?: string; now?: Date },
): KeymapProfile {
  const layers: ProfileLayer[] = result.layers.map((layer) => ({
    name: layer.displayName,
    bindings: layer.bindings.map((binding) => ({
      behavior: binding.behavior,
      behaviorId: -1,
      param1: binding.param1,
      param2: binding.param2,
    })),
  }));

  return {
    version: 1,
    name: options.name,
    createdAt: (options.now ?? new Date()).toISOString(),
    deviceName: options.deviceName,
    keyCount: layers[0]?.bindings.length ?? 0,
    layers,
  };
}

/** テキストから直接プロファイルを作るショートカット。 */
export function importKeymapDtsi(
  source: string,
  options: { name: string; deviceName?: string; now?: Date },
): { profile: KeymapProfile; warnings: string[] } {
  const result = parseKeymapDtsi(source);
  return { profile: dtsiToProfile(result, options), warnings: result.warnings };
}
