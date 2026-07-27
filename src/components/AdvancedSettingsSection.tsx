import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  IconAlertTriangleFilled,
  IconChevronDown,
  IconChevronRight,
  IconCode,
  IconDeviceFloppy,
  IconInfoCircle,
  IconLoader2,
  IconRefresh,
  IconRotateClockwise,
  IconX,
} from "@tabler/icons-react";
import {
  CUSTOM_SETTINGS_SOURCE_ALL,
  useCustomSettings,
  type CustomSettingsSection,
  type UseCustomSettingsReturn,
} from "../hooks/useCustomSettings";
import { MEMORY_WRITE_DEBOUNCE_MS } from "../hooks/useDebouncedMemoryWrite";
import { StatusBadge, StatusDot, type EditStatus } from "./EditStatusIndicator";
import { LoadingIndicator } from "./LoadingIndicator";
import { useKeymap, type BehaviorDefinition } from "../hooks/useKeymap";
import { useLanguage } from "../hooks/useLanguage";
import {
  type Setting,
  type SettingBehaviorValue,
  type SettingConstraint,
  type SettingScalarValue,
  type SettingValue,
} from "../proto/cormoran/zmk/custom_settings/custom_settings";

type ValueKind = "bytes" | "int32" | "bool" | "string" | "behavior" | "unknown";

// Input that keeps its own local value while focused so that parent-driven
// updates (e.g. after a debounced memory write completes) don't reset the
// cursor or steal focus mid-edit.
//
// Uses React's derived-state pattern (react.dev/learn/you-might-not-need-an-effect
// #adjusting-some-state-when-a-prop-changes): prevProp tracks the last seen
// prop value; when it changes and the field is not focused, local is updated
// synchronously during render without going through an effect.
function RetainedInput({
  value,
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const [prevProp, setPrevProp] = useState(value);
  const [focused, setFocused] = useState(false);

  if (prevProp !== value) {
    setPrevProp(value);
    if (!focused) {
      setLocal(value);
    }
  }

  return (
    <input
      {...rest}
      value={local}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}

// Custom subsystem identifier registered by the pmw3610 driver's settings
// module (see src/settings/pmw3610_settings.c in the driver repository).
export const PMW3610_CUSTOM_SETTINGS_IDENTIFIER = "cormoran__pmw3610";

interface SettingGroupDef {
  title: string;
  description: string;
  // Field name is the setting key without its "@<device-id>" suffix.
  fields: string[];
}

// Groups + light descriptions for the pmw3610 driver's own settings (see
// PMW3610_DEFINE_INST_SETTINGS in that repo's pmw3610_settings.c), so the
// per-field keys below stay in sync with the driver's field names.
const PMW3610_SETTING_GROUPS: SettingGroupDef[] = [
  {
    title: "Sensitivity",
    description: "Tracking resolution.",
    fields: ["cpi"],
  },
  {
    title: "Orientation",
    description: "Axis mapping for how the sensor is mounted.",
    fields: ["swap_xy", "invert_x", "invert_y"],
  },
  {
    title: "Power & Rest Mode",
    description:
      "Idle downshift stages that reduce sensor polling and power use while the trackball is not moving.",
    fields: [
      "force_awake",
      "smart_algorithm",
      "run_downshift_ms",
      "rest1_downshift_ms",
      "rest2_downshift_ms",
      "rest1_sample_ms",
      "rest2_sample_ms",
      "rest3_sample_ms",
    ],
  },
  {
    title: "Reporting",
    description: "How often motion reports are sent to the host.",
    fields: ["report_interval_min_ms"],
  },
];

const PMW3610_FIELD_DESCRIPTIONS: Record<string, string> = {
  cpi: "Sensor resolution in counts per inch. Higher values move the cursor faster for the same physical motion.",
  swap_xy: "Swap the X and Y axes.",
  invert_x: "Invert the horizontal movement direction.",
  invert_y: "Invert the vertical movement direction.",
  force_awake:
    "Keep the sensor fully powered, skipping the rest mode stages below.",
  smart_algorithm: "Enable the sensor's adaptive positioning algorithm.",
  run_downshift_ms:
    "Time of continuous motion before dropping from Run mode into Rest1.",
  rest1_downshift_ms: "Time in Rest1 before dropping into Rest2.",
  rest2_downshift_ms: "Time in Rest2 before dropping into Rest3.",
  rest1_sample_ms: "Sensor sampling interval while in Rest1.",
  rest2_sample_ms: "Sensor sampling interval while in Rest2.",
  rest3_sample_ms:
    "Sensor sampling interval while in Rest3, the deepest idle stage.",
  report_interval_min_ms:
    "Minimum time between motion reports sent to the host.",
};

// Setting keys are unique per pmw3610 device instance ("<field>@<id>"); the
// grouping/description lookups above only care about the field name.
function fieldName(key: string): string {
  const at = key.indexOf("@");
  return at === -1 ? key : key.slice(0, at);
}

// ---------------------------------------------------------------------------
// Generic setting descriptions
//
// Settings outside the PMW3610 groups previously showed only their raw key,
// which made it hard to tell what each item does. A description is resolved
// for every row and shown under the setting name, in this order:
//   1. Per-subsystem field names, because the same field name means different
//      things in different modules (SUBSYSTEM_FIELD_DESCRIPTIONS)
//   2. Known field names shared across firmware modules
//      (KNOWN_FIELD_DESCRIPTIONS)
//   3. Keyspace prefixes such as "macro/" (KEYSPACE_PREFIX_DESCRIPTIONS)
//   4. A fallback derived from the setting's value type, unit suffix and
//      constraints (describeSettingByShape), so even unknown module settings
//      say what KIND of number/value they take (milliseconds, percent,
//      index, ...) rather than just "numeric value".
// Texts are kept bilingual here (instead of the i18n dictionary) so adding a
// new entry stays a single-object change.
// ---------------------------------------------------------------------------

interface BilingualText {
  en: string;
  ja: string;
}

function pickText(text: BilingualText, language: string): string {
  return language === "ja" ? text.ja : text.en;
}

// Custom subsystem identifiers whose settings get tailored descriptions.
const RUNTIME_COMBO_IDENTIFIER = "cormoran__runtime_combo";
const RUNTIME_MACRO_IDENTIFIER = "cormoran__runtime_macro";
const RUNTIME_INPUT_PROCESSOR_IDENTIFIER = "cormoran__runtime_input_processor";
const DEFAULT_LAYER_IDENTIFIER = "cormoran__default_layer";
const OS_DETECTION_IDENTIFIER = "cormoran__os_detection";

const SECTION_DESCRIPTIONS: Record<string, BilingualText> = {
  cormoran_custom_settings: {
    en: "General storage shared by firmware modules for their settings and runtime data (runtime macros, combos, OS profiles, ...).",
    ja: "各ファームウェアモジュールが設定やランタイムデータ（ランタイムマクロ・コンボ・OSプロファイルなど）を保存する共用領域です。",
  },
  [PMW3610_CUSTOM_SETTINGS_IDENTIFIER]: {
    en: "Settings for the PMW3610 trackball sensor driver.",
    ja: "PMW3610トラックボールセンサードライバの設定です。",
  },
  [RUNTIME_COMBO_IDENTIFIER]: {
    en: "Timing defaults for combos (pressing several keys at once to send a different key).",
    ja: "コンボ（複数キーの同時押しで別のキーを送る機能）の既定タイミング設定です。",
  },
  [RUNTIME_MACRO_IDENTIFIER]: {
    en: "Timing defaults used when a macro plays back its key presses.",
    ja: "マクロがキー入力を再生するときのタイミング既定値です。",
  },
  [RUNTIME_INPUT_PROCESSOR_IDENTIFIER]: {
    en: "Settings for input processors, which transform pointer/scroll input before it reaches the host.",
    ja: "入力プロセッサ（ポインタやスクロールの入力をホストに送る前に加工する仕組み）の設定です。",
  },
  [DEFAULT_LAYER_IDENTIFIER]: {
    en: "Which keymap layer is used as the base layer, optionally per connection / OS.",
    ja: "どのキーマップレイヤーを基本レイヤーとして使うか（接続先やOSごとの指定を含む）の設定です。",
  },
  [OS_DETECTION_IDENTIFIER]: {
    en: "Detection and manual override of the operating system the keyboard is connected to.",
    ja: "接続先OSの自動判定と手動上書きに関する設定です。",
  },
};

// Field descriptions that only make sense in the context of one subsystem
// (e.g. "timeout_ms" is the combo press window here, but something else in
// another module).
const SUBSYSTEM_FIELD_DESCRIPTIONS: Record<
  string,
  Record<string, BilingualText>
> = {
  [RUNTIME_COMBO_IDENTIFIER]: {
    timeout_ms: {
      en: "How long after the first key the remaining combo keys must be pressed for the combo to trigger. Shorter values reduce accidental combos; longer values make combos easier to hit.",
      ja: "コンボが成立する同時押しの判定時間です。最初のキーを押してからこの時間内に残りのキーを押すとコンボになります。短くすると誤発動が減り、長くすると成立しやすくなります。",
    },
    require_prior_idle_ms: {
      en: "Ignore the combo unless the keyboard was idle for at least this long before the first key. Prevents combos from firing mid-typing. 0 disables the check.",
      ja: "直前の打鍵からこの時間以上キーボードが空いていないとコンボを成立させません。速く打鍵している最中の誤発動を防ぎます。0で無効になります。",
    },
    slow_release: {
      en: "When enabled, the combo stays held until every combo key is released. When disabled, it releases as soon as the first key is released.",
      ja: "有効にすると、コンボのキーをすべて離すまでコンボを押したままの状態に保ちます。無効なら最初の1キーを離した時点で解除されます。",
    },
    key_positions: {
      en: "Key positions (keymap key numbers) that make up this combo.",
      ja: "このコンボを構成するキーの位置（キーマップ上のキー番号）です。",
    },
    layers: {
      en: "Layers on which this combo is active.",
      ja: "このコンボが有効になるレイヤーです。",
    },
  },
  [RUNTIME_MACRO_IDENTIFIER]: {
    tap_ms: {
      en: "How long each key in a macro is held down before being released during playback. Increase it if the host drops keystrokes from fast macros.",
      ja: "マクロ再生時に各キーを押してから離すまでの時間です。マクロが速すぎてホストが取りこぼす場合は長くします。",
    },
    wait_ms: {
      en: "Pause inserted between the steps of a macro during playback.",
      ja: "マクロ再生時に各ステップの間に入れる待ち時間です。",
    },
  },
  [DEFAULT_LAYER_IDENTIFIER]: {
    default_layer: {
      en: "Keymap layer used as the base layer when no other layer is activated.",
      ja: "他のレイヤーが有効になっていないときに使う基本レイヤーです。",
    },
  },
};

const KNOWN_FIELD_DESCRIPTIONS: Record<string, BilingualText> = {
  default_layer: {
    en: "Index of the base (default) layer used when no other layer is active. The default-layer module can switch this per connection / OS.",
    ja: "他のレイヤーが有効でないときに使う基本（デフォルト）レイヤーの番号です。default-layerモジュールが接続先やOSごとに切り替えられます。",
  },
  tap_behavior: {
    en: "ID of the behavior executed on tap.",
    ja: "タップ時に実行するビヘイビア（動作）のIDです。",
  },
  tap_behavior_binding: {
    en: "Behavior binding (behavior + param1/param2) assigned to tap.",
    ja: "タップに割り当てるビヘイビアとパラメータ（param1/param2）の組です。",
  },
  feature_enabled: {
    en: "Toggles this module's feature on or off.",
    ja: "このモジュールの機能のオン/オフを切り替えます。",
  },
  profile_name: {
    en: "Selects which profile (operating mode) to use.",
    ja: "使用するプロファイル（動作モード）を選びます。",
  },
  macro_bytes: {
    en: "Raw macro payload bytes (normally edited from the Macro & Combo tab rather than here).",
    ja: "マクロ本体のバイナリデータです（通常はここではなくMacro & Comboタブから編集します）。",
  },
  os: {
    en: "Operating system associated with this connection profile.",
    ja: "この接続プロファイルに関連付けられたOSです。",
  },
  os_override: {
    en: "Manually overrides the detected operating system for this connection.",
    ja: "この接続先で検出されたOSを手動で上書きします。",
  },
  detected_os: {
    en: "Operating system detected for this connection.",
    ja: "この接続先で検出されたOSです。",
  },
  tapping_term_ms: {
    en: "How long a key must be held before it counts as a hold instead of a tap.",
    ja: "キーを押し続けたときに「タップ」ではなく「ホールド」と判定されるまでの時間です。",
  },
  quick_tap_ms: {
    en: "If the same key is tapped again within this time, it repeats the tap instead of holding.",
    ja: "同じキーをこの時間内に再度押すと、ホールドではなくタップの連打として扱われます。",
  },
  timeout_ms: {
    en: "Time limit this feature waits before giving up or resetting.",
    ja: "この機能が判定を打ち切る、またはリセットするまでの待ち時間です。",
  },
  tap_ms: {
    en: "How long each key press is held down before being released.",
    ja: "キーを押してから離すまでの保持時間です。",
  },
  wait_ms: {
    en: "Pause inserted between consecutive steps.",
    ja: "連続する処理の間に入れる待ち時間です。",
  },
  require_prior_idle_ms: {
    en: "The keyboard must have been idle for at least this long beforehand, otherwise the feature is skipped. 0 disables the check.",
    ja: "直前にこの時間以上キーボードが空いていなければ、この機能は動作しません。0で無効になります。",
  },
  slow_release: {
    en: "Hold the output until every involved key is released, instead of releasing on the first one.",
    ja: "関係するキーをすべて離すまで出力を保持します（最初の1キーで解除しません）。",
  },
};

const KEYSPACE_PREFIX_DESCRIPTIONS: Array<{
  prefix: string;
  text: BilingualText;
}> = [
  {
    prefix: "macro/",
    text: {
      en: "Stored data for a runtime macro slot (edit it from the Macro & Combo tab).",
      ja: "ランタイムマクロのスロットに保存されたデータです（編集はMacro & Comboタブから行えます）。",
    },
  },
  {
    prefix: "combo/",
    text: {
      en: "Stored data for a runtime combo slot (edit it from the Macro & Combo tab).",
      ja: "ランタイムコンボのスロットに保存されたデータです（編集はMacro & Comboタブから行えます）。",
    },
  },
];

// Unit hints derived from the field-name suffix. Used when no explicit
// description exists, so a numeric row explains WHAT the number is (a
// duration, a percentage, an index, ...) instead of only "numeric value".
const NUMERIC_UNIT_HINTS: Array<{ match: RegExp; text: BilingualText }> = [
  {
    match: /_ms$/,
    text: {
      en: "A length of time in milliseconds (1000 ms = 1 second)",
      ja: "時間をミリ秒で指定します（1000ミリ秒 = 1秒）",
    },
  },
  {
    match: /_us$/,
    text: {
      en: "A length of time in microseconds",
      ja: "時間をマイクロ秒で指定します",
    },
  },
  {
    match: /_(sec|secs|seconds)$/,
    text: {
      en: "A length of time in seconds",
      ja: "時間を秒で指定します",
    },
  },
  {
    match: /_(minutes|mins)$/,
    text: {
      en: "A length of time in minutes",
      ja: "時間を分で指定します",
    },
  },
  {
    match: /_(hz|frequency)$/,
    text: {
      en: "A frequency in hertz (times per second)",
      ja: "周波数（1秒あたりの回数）を指定します",
    },
  },
  {
    match: /_(pct|percent|percentage)$/,
    text: {
      en: "A percentage",
      ja: "割合をパーセントで指定します",
    },
  },
  {
    match: /_(count|num|len|length|size|bytes|slots)$/,
    text: {
      en: "A number of items",
      ja: "個数や大きさを指定します",
    },
  },
  {
    match: /_(index|idx|slot|id)$/,
    text: {
      en: "A zero-based number identifying which item is used",
      ja: "どの項目を使うかを表す番号です（0から始まります）",
    },
  },
  {
    match: /^(cpi|dpi)$/,
    text: {
      en: "A resolution in counts per inch; higher moves the cursor further for the same motion",
      ja: "解像度（1インチあたりのカウント数）です。大きいほど同じ動きでカーソルが速く動きます",
    },
  },
  {
    match: /_(divisor|multiplier|scale|factor)$/,
    text: {
      en: "A scaling factor applied to the raw value",
      ja: "元の値に掛ける倍率（スケール）です",
    },
  },
];

// Fallback used when a setting has no known field/keyspace description:
// derive a short explanation from its name, constraints and value type so the
// user can at least tell what kind of value the item takes.
function describeSettingByShape(setting: Setting, language: string): string {
  const ja = language === "ja";
  const field = fieldName(setting.key);
  if (hasLayerConstraint(setting)) {
    return ja
      ? "キーマップのレイヤーを選択する設定です。"
      : "Selects a keymap layer.";
  }
  if (hasBehaviorConstraint(setting)) {
    return ja
      ? "キーの動作（ビヘイビア）を選択する設定です。"
      : "Selects a key behavior.";
  }
  if (optionsConstraint(setting)) {
    return ja
      ? "あらかじめ用意された選択肢から選ぶ設定です。"
      : "Choose one of the predefined options.";
  }
  const range = rangeConstraint(setting);
  switch (valueKind(setting)) {
    case "bool":
      if (/(_enabled?|^enable(d)?$)/.test(field)) {
        return ja
          ? "この機能を使うかどうかを切り替えます。"
          : "Turns this feature on or off.";
      }
      if (/^(invert|swap)/.test(field) || /_(invert|inverted)$/.test(field)) {
        return ja
          ? "方向や軸の入れ替えを切り替えます。"
          : "Flips the direction / axis mapping.";
      }
      return ja ? "オン/オフを切り替える設定です。" : "On/off toggle.";
    case "int32": {
      const min = range?.min?.int32Value;
      const max = range?.max?.int32Value;
      const rangeText =
        min !== undefined || max !== undefined
          ? ja
            ? `（範囲: ${min ?? "?"}〜${max ?? "?"}）`
            : ` (range: ${min ?? "?"}–${max ?? "?"})`
          : "";
      const unit = NUMERIC_UNIT_HINTS.find((hint) => hint.match.test(field));
      if (unit) {
        return `${pickText(unit.text, language)}${rangeText}${ja ? "。" : "."}`;
      }
      return ja
        ? `数値の設定です${rangeText}。意味は提供元モジュールのドキュメントを参照してください。`
        : `A numeric value${rangeText}. See the providing module's documentation for what it controls.`;
    }
    case "string":
      return ja ? "文字列の設定です。" : "Text value.";
    case "bytes":
      return ja
        ? "バイナリ値の設定です。形式は提供元モジュールのドキュメントを参照してください。"
        : "Raw binary value; see the providing module's documentation for its format.";
    case "behavior":
      return ja
        ? "押したときに実行する動作（ビヘイビア）とそのパラメータ（param1/param2）を指定します。"
        : "The behavior run when triggered, plus its parameters (param1/param2).";
    default:
      return ja
        ? "このモジュール固有の設定です。詳細は提供元モジュールのドキュメントを参照してください。"
        : "Module-specific setting; see the providing module's documentation.";
  }
}

function resolveSettingDescription(
  setting: Setting,
  language: string,
  sectionIdentifier?: string,
): string {
  const field = fieldName(setting.key);
  const perSubsystem = sectionIdentifier
    ? SUBSYSTEM_FIELD_DESCRIPTIONS[sectionIdentifier]?.[field]
    : undefined;
  if (perSubsystem) return pickText(perSubsystem, language);
  const known = KNOWN_FIELD_DESCRIPTIONS[field];
  if (known) return pickText(known, language);
  const keyspace = KEYSPACE_PREFIX_DESCRIPTIONS.find((entry) =>
    setting.key.startsWith(entry.prefix),
  );
  if (keyspace) return pickText(keyspace.text, language);
  return describeSettingByShape(setting, language);
}

function findScrollableAncestor(el: Element | null): Element | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

interface ScrollPin {
  container: Element;
  scrollTop: number;
}

// Discard/Reset toggle the shared `isLoading` flag, which disables (and can
// blur) buttons across the whole settings list; that re-render can shift the
// scroll position. Pin it back via useLayoutEffect (runs synchronously after
// every commit, unlike requestAnimationFrame) on each isLoading flip so the
// list doesn't visibly jump.
function useScrollPin(isLoading: boolean) {
  const pinRef = useRef<ScrollPin | null>(null);

  useLayoutEffect(() => {
    if (pinRef.current) {
      pinRef.current.container.scrollTop = pinRef.current.scrollTop;
    }
  }, [isLoading]);

  return function withScrollPin<T>(
    triggerElement: Element | null,
    action: () => Promise<T>,
  ): Promise<T> {
    const container = findScrollableAncestor(triggerElement);
    if (container) {
      pinRef.current = { container, scrollTop: container.scrollTop };
    }
    return action().finally(() => {
      pinRef.current = null;
    });
  };
}

interface InfoTooltipProps {
  label: string;
  children: ReactNode;
}

function InfoTooltip({ label, children }: InfoTooltipProps) {
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <IconInfoCircle
            size={14}
            className="cursor-help text-[var(--color-text-muted)]"
            aria-label={label}
          />
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="px-3 py-2 rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] shadow-lg z-50 max-w-xs"
            sideOffset={5}
          >
            {children}
            <Tooltip.Arrow className="fill-[var(--color-surface-elevated)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

function scalarValue(setting: Setting): SettingScalarValue | undefined {
  return setting.value?.arrayValue?.value ?? setting.value;
}

function valueKind(setting: Setting): ValueKind {
  const scalar = scalarValue(setting);
  if (!scalar) return "unknown";
  if (scalar.bytesValue !== undefined) return "bytes";
  if (scalar.int32Value !== undefined) return "int32";
  if (scalar.boolValue !== undefined) return "bool";
  if (scalar.stringValue !== undefined) return "string";
  if (scalar.behaviorValue !== undefined) return "behavior";
  return "unknown";
}

function parseBehaviorValue(value: string): SettingBehaviorValue {
  const [behaviorId = 0, param1 = 0, param2 = 0] = value
    .split(",")
    .map((token) => Number.parseInt(token.trim(), 10) || 0);
  return { behaviorId, param1, param2 };
}

function formatBehaviorValue(value: SettingBehaviorValue): string {
  return `${value.behaviorId},${value.param1},${value.param2}`;
}

function scalarToSettingValue(kind: ValueKind, value: unknown): SettingValue {
  if (kind === "bytes") {
    return { bytesValue: value as Uint8Array };
  }
  if (kind === "bool") {
    return { boolValue: Boolean(value) };
  }
  if (kind === "string") {
    return { stringValue: String(value) };
  }
  if (kind === "behavior") {
    return { behaviorValue: parseBehaviorValue(String(value)) };
  }
  return { int32Value: Number(value) || 0 };
}

function scalarToInputValue(setting: Setting): string {
  const scalar = scalarValue(setting);
  if (!scalar) return "";
  if (scalar.bytesValue !== undefined) return bytesToHex(scalar.bytesValue);
  if (scalar.int32Value !== undefined) return `${scalar.int32Value}`;
  if (scalar.boolValue !== undefined)
    return scalar.boolValue ? "true" : "false";
  if (scalar.stringValue !== undefined) return scalar.stringValue;
  if (scalar.behaviorValue !== undefined)
    return formatBehaviorValue(scalar.behaviorValue);
  return "";
}

function sourceLabel(
  source: number,
  t: (key: string, params?: Record<string, number | string>) => string,
): string {
  if (source === 0) return t("Central");
  if (source === CUSTOM_SETTINGS_SOURCE_ALL) return t("All");
  return t("Peripheral {{n}}", { n: source });
}

function settingLabel(setting: Setting): string {
  const arraySuffix = setting.value?.arrayValue
    ? `[${setting.value.arrayValue.index}]`
    : "";
  return `${setting.key}${arraySuffix}`;
}

function constraints(setting: Setting): SettingConstraint[] {
  return setting.meta?.constraints ?? [];
}

function hasLayerConstraint(setting: Setting): boolean {
  return constraints(setting).some(
    (constraint) => constraint.layerId !== undefined,
  );
}

function hasBehaviorConstraint(setting: Setting): boolean {
  return constraints(setting).some(
    (constraint) => constraint.behaviorId !== undefined,
  );
}

function optionsConstraint(setting: Setting) {
  return constraints(setting).find((constraint) => constraint.options)?.options;
}

function rangeConstraint(setting: Setting) {
  return constraints(setting).find((constraint) => constraint.range)?.range;
}

function scalarOptionValue(value: SettingScalarValue): string {
  if (value.int32Value !== undefined) return `${value.int32Value}`;
  if (value.boolValue !== undefined) return value.boolValue ? "true" : "false";
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return bytesToHex(value.bytesValue);
  if (value.behaviorValue !== undefined)
    return formatBehaviorValue(value.behaviorValue);
  return "";
}

function scalarOptionToSettingValue(value: SettingScalarValue): SettingValue {
  if (value.int32Value !== undefined) return { int32Value: value.int32Value };
  if (value.boolValue !== undefined) return { boolValue: value.boolValue };
  if (value.stringValue !== undefined)
    return { stringValue: value.stringValue };
  if (value.bytesValue !== undefined) return { bytesValue: value.bytesValue };
  if (value.behaviorValue !== undefined)
    return { behaviorValue: value.behaviorValue };
  return {};
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function parseHexBytes(value: string, errorMessage: string): Uint8Array {
  const trimmed = value.trim();
  if (!trimmed) return new Uint8Array();

  const normalized = trimmed.replace(/0x/gi, "");
  const tokens = normalized.split(/[\s,]+/).filter(Boolean);
  if (tokens.some((token) => !/^[0-9a-fA-F]{1,2}$/.test(token))) {
    throw new Error(errorMessage);
  }

  return Uint8Array.from(tokens.map((token) => Number.parseInt(token, 16)));
}

function bytesToPrintableAscii(value: Uint8Array): string {
  return Array.from(value)
    .map((byte) =>
      byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ".",
    )
    .join("");
}

function sourceSortValue(source: number): number {
  if (source === 0) return -1;
  if (source === CUSTOM_SETTINGS_SOURCE_ALL) return Number.MAX_SAFE_INTEGER;
  return source;
}

function settingSortValue(setting: Setting): string {
  return [
    setting.key,
    `${setting.value?.arrayValue?.index ?? -1}`.padStart(8, "0"),
    `${sourceSortValue(setting.source)}`.padStart(12, "0"),
  ].join(":");
}

interface ByteEditorModalProps {
  bytes: Uint8Array;
  title: string;
  onApply: (bytes: Uint8Array) => void;
  onClose: () => void;
}

function ByteEditorModal({
  bytes,
  title,
  onApply,
  onClose,
}: ByteEditorModalProps) {
  const { t } = useLanguage();
  const [hexText, setHexText] = useState(bytesToHex(bytes));
  const [asciiText, setAsciiText] = useState(bytesToPrintableAscii(bytes));
  const [error, setError] = useState<string | null>(null);

  const parsedBytes = useMemo(() => {
    try {
      return parseHexBytes(
        hexText,
        t("Use hexadecimal bytes such as 00 ff 2a."),
      );
    } catch {
      return null;
    }
  }, [hexText, t]);

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)]">
              {t("Bytecode Editor")}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">{title}</p>
          </div>
          <button
            type="button"
            className="theme-toggle h-9 w-9"
            onClick={onClose}
            title={t("Close")}
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <span className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
              {t("Hex bytes")}
            </span>
            <textarea
              className="input-field min-h-32 font-mono text-sm"
              spellCheck={false}
              value={hexText}
              onChange={(event) => {
                setHexText(event.target.value);
                setError(null);
              }}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-medium text-[var(--color-text-muted)]">
              {t("ASCII helper")}
            </span>
            <div className="flex gap-2">
              <input
                className="input-field font-mono text-sm"
                value={asciiText}
                onChange={(event) => setAsciiText(event.target.value)}
              />
              <button
                type="button"
                className="btn-ghost whitespace-nowrap border border-[var(--color-border)]"
                onClick={() => {
                  const encoded = new TextEncoder().encode(asciiText);
                  setHexText(bytesToHex(encoded));
                  setError(null);
                }}
              >
                {t("Encode")}
              </button>
            </div>
          </label>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3">
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("Length: {{count}} bytes", {
                count: parsedBytes?.length ?? 0,
              })}
            </p>
            <p className="mt-2 break-all font-mono text-xs text-[var(--color-text-secondary)]">
              {parsedBytes
                ? bytesToPrintableAscii(parsedBytes)
                : t("Invalid hex")}
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="btn-electric text-sm"
            onClick={() => {
              try {
                onApply(
                  parseHexBytes(
                    hexText,
                    t("Use hexadecimal bytes such as 00 ff 2a."),
                  ),
                );
                onClose();
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : t("Invalid bytes"),
                );
              }
            }}
          >
            {t("Apply")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface SettingEditorProps {
  setting: Setting;
  layers: { id: number; name: string }[];
  behaviors: Map<number, BehaviorDefinition>;
  onChange: (value: SettingValue) => void;
}

function SettingEditor({
  setting,
  layers,
  behaviors,
  onChange,
}: SettingEditorProps) {
  const { t } = useLanguage();
  const kind = valueKind(setting);
  const currentValue = scalarToInputValue(setting);
  const [isBytesOpen, setIsBytesOpen] = useState(false);
  const range = rangeConstraint(setting);
  const options = optionsConstraint(setting);

  if (!setting.value) {
    return (
      <span className="text-sm text-[var(--color-text-muted)]">
        {t("Value is hidden by firmware permissions")}
      </span>
    );
  }

  if (hasLayerConstraint(setting)) {
    return (
      <select
        className="input-field max-w-xs text-sm"
        value={currentValue}
        onChange={(event) =>
          onChange({ int32Value: Number.parseInt(event.target.value, 10) })
        }
      >
        {layers.map((layer) => (
          <option key={layer.id} value={layer.id}>
            {layer.name || t("Layer {{id}}", { id: layer.id })} ({layer.id})
          </option>
        ))}
        {layers.length === 0 && (
          <option value={currentValue}>{currentValue}</option>
        )}
      </select>
    );
  }

  if (hasBehaviorConstraint(setting)) {
    const behaviorList = Array.from(behaviors.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    return (
      <select
        className="input-field max-w-xs text-sm"
        value={currentValue}
        onChange={(event) =>
          onChange({ int32Value: Number.parseInt(event.target.value, 10) })
        }
      >
        {behaviorList.map((behavior) => (
          <option key={behavior.id} value={behavior.id}>
            {behavior.displayName} ({behavior.id})
          </option>
        ))}
        {behaviorList.length === 0 && (
          <option value={currentValue}>{currentValue}</option>
        )}
      </select>
    );
  }

  if (options) {
    return (
      <select
        className="input-field max-w-xs text-sm"
        value={currentValue}
        onChange={(event) => {
          const selectedIndex = options.values.findIndex(
            (value) => scalarOptionValue(value) === event.target.value,
          );
          if (selectedIndex >= 0) {
            onChange(scalarOptionToSettingValue(options.values[selectedIndex]));
          }
        }}
      >
        {options.values.map((value, index) => (
          <option
            key={`${scalarOptionValue(value)}:${index}`}
            value={scalarOptionValue(value)}
          >
            {options.labels[index] || scalarOptionValue(value)}
          </option>
        ))}
      </select>
    );
  }

  if (kind === "bool") {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={currentValue === "true"}
          onChange={(event) => onChange({ boolValue: event.target.checked })}
        />
        {t("Enabled")}
      </label>
    );
  }

  if (kind === "bytes") {
    const bytes = scalarValue(setting)?.bytesValue ?? new Uint8Array();
    return (
      <div className="flex min-w-0 items-center gap-2">
        <code className="min-w-0 max-w-sm truncate rounded bg-[var(--color-bg)] px-3 py-2 font-mono text-xs text-[var(--color-text-secondary)]">
          {bytesToHex(bytes) || t("(empty)")}
        </code>
        <button
          type="button"
          className="theme-toggle h-10 w-10"
          onClick={() => setIsBytesOpen(true)}
          title={t("Edit bytecode")}
        >
          <IconCode size={18} />
        </button>
        {isBytesOpen && (
          <ByteEditorModal
            bytes={bytes}
            title={settingLabel(setting)}
            onApply={(nextBytes) => onChange({ bytesValue: nextBytes })}
            onClose={() => setIsBytesOpen(false)}
          />
        )}
      </div>
    );
  }

  if (kind === "int32") {
    const min = range?.min?.int32Value;
    const max = range?.max?.int32Value;
    return (
      <RetainedInput
        className="input-field max-w-xs text-sm"
        type="number"
        min={min}
        max={max}
        value={currentValue}
        onChange={(val) =>
          onChange(scalarToSettingValue("int32", Number.parseInt(val, 10)))
        }
      />
    );
  }

  if (kind === "behavior") {
    // This is the SettingValue.behavior_value VALUE type (behaviorId +
    // param1 + param2), distinct from SettingConstraintBehaviorId above
    // (an INT32-typed value constrained to a behavior selector).
    const behaviorValue = scalarValue(setting)?.behaviorValue ?? {
      behaviorId: 0,
      param1: 0,
      param2: 0,
    };
    const behaviorList = Array.from(behaviors.values()).sort((a, b) =>
      a.displayName.localeCompare(b.displayName),
    );
    const emitBehaviorValue = (next: Partial<SettingBehaviorValue>) =>
      onChange({ behaviorValue: { ...behaviorValue, ...next } });
    return (
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input-field max-w-[10rem] text-sm"
          value={behaviorValue.behaviorId}
          onChange={(event) =>
            emitBehaviorValue({
              behaviorId: Number.parseInt(event.target.value, 10),
            })
          }
        >
          {behaviorList.map((behavior) => (
            <option key={behavior.id} value={behavior.id}>
              {behavior.displayName} ({behavior.id})
            </option>
          ))}
          {behaviorList.length === 0 && (
            <option value={behaviorValue.behaviorId}>
              {behaviorValue.behaviorId}
            </option>
          )}
        </select>
        <RetainedInput
          className="input-field w-20 text-sm"
          type="number"
          title={t("Param 1")}
          placeholder={t("Param 1")}
          value={`${behaviorValue.param1}`}
          onChange={(val) =>
            emitBehaviorValue({
              param1: Number.parseInt(val, 10) || 0,
            })
          }
        />
        <RetainedInput
          className="input-field w-20 text-sm"
          type="number"
          title={t("Param 2")}
          placeholder={t("Param 2")}
          value={`${behaviorValue.param2}`}
          onChange={(val) =>
            emitBehaviorValue({
              param2: Number.parseInt(val, 10) || 0,
            })
          }
        />
      </div>
    );
  }

  return (
    <RetainedInput
      className="input-field max-w-xs text-sm"
      value={currentValue}
      onChange={(val) => onChange({ stringValue: val })}
    />
  );
}

// Shared by each SettingRow so the name and editor columns line up. Source is
// no longer a column (it is chosen once via the selector above the list), so
// only two columns remain: the setting name and its editor.
const SETTINGS_TABLE_GRID_COLS =
  "md:grid-cols-[minmax(12rem,1.5fr)_minmax(12rem,1fr)]";

// Transient write state shown next to the setting name (in place of the old
// standalone Status column). Only rendered while a write is queued/in flight;
// otherwise the green/blue edit-status dot is shown instead.
function RowStatusIndicator({
  saveState,
  editStatus,
}: {
  saveState: "idle" | "queued" | "saving";
  editStatus: EditStatus;
}) {
  const { t } = useLanguage();
  if (saveState === "saving") {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] text-[var(--color-neon)]">
        <IconLoader2 size={12} className="animate-spin" />
        {t("Saving…")}
      </span>
    );
  }
  if (saveState === "queued") {
    return (
      <span className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
        <StatusDot status="unsaved" />
        {t("Queued")}
      </span>
    );
  }
  return <StatusDot status={editStatus} />;
}

// Link-style hint shown below the editor whenever the current value differs
// from the setting's default. Clicking it writes the default back into memory
// (the per-item Reset affordance, folded into the value display).
function DefaultValueHint({
  displayValue,
  onApply,
}: {
  displayValue: string;
  onApply: () => void;
}) {
  const { t } = useLanguage();
  return (
    <Tooltip.Provider delayDuration={200}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type="button"
            onClick={onApply}
            className="group inline-flex max-w-full items-baseline gap-1 text-left text-[11px]"
          >
            <span className="flex-shrink-0 text-[var(--color-text-muted)]">
              {t("Default:")}
            </span>
            <span className="truncate font-mono text-[var(--color-electric)] underline decoration-dotted underline-offset-2 group-hover:decoration-solid">
              {displayValue}
            </span>
          </button>
        </Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            className="px-3 py-2 rounded bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] shadow-lg z-50 max-w-xs"
            sideOffset={5}
          >
            {t("Click to restore the default value.")}
            <Tooltip.Arrow className="fill-[var(--color-surface-elevated)]" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}

interface SettingRowProps {
  setting: Setting;
  description?: string;
  layers: { id: number; name: string }[];
  behaviors: Map<number, BehaviorDefinition>;
  onWrite: (setting: Setting, value: SettingValue) => Promise<void>;
}

function SettingRow({
  setting,
  description,
  layers,
  behaviors,
  onWrite,
}: SettingRowProps) {
  const [saveState, setSaveState] = useState<"idle" | "queued" | "saving">(
    "idle",
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Green when the value lives only in memory, blue when it is persisted but
  // differs from the compile-time default (device reports defaultValue only in
  // that case), nothing when it matches the default.
  const editStatus: EditStatus = setting.hasUnsavedValue
    ? "unsaved"
    : setting.defaultValue !== undefined
      ? "modified"
      : "default";

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const queueMemoryWrite = (value: SettingValue) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setSaveState("queued");
    timeoutRef.current = setTimeout(() => {
      setSaveState("saving");
      void onWrite(setting, value).finally(() => setSaveState("idle"));
    }, MEMORY_WRITE_DEBOUNCE_MS);
  };

  // The default value (present only when the current value differs from it) is
  // a scalar SettingValue; render it the same way the current value is shown.
  // Suppress the hint once the (possibly in-memory) value already matches the
  // default, e.g. right after clicking the hint but before the next reload.
  const defaultValue = setting.defaultValue;
  const defaultDisplayValue =
    defaultValue !== undefined
      ? scalarToInputValue({ ...setting, value: defaultValue })
      : undefined;
  const showDefaultHint =
    defaultValue !== undefined &&
    defaultDisplayValue !== undefined &&
    defaultDisplayValue !== scalarToInputValue(setting);

  return (
    <div
      className={`grid gap-3 border-t border-[var(--color-border)] py-4 md:items-start ${SETTINGS_TABLE_GRID_COLS}`}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-[var(--color-text)]">
            {settingLabel(setting)}
          </p>
          <RowStatusIndicator saveState={saveState} editStatus={editStatus} />
        </div>
        {description && (
          <p className="mt-1 text-[11px] leading-snug text-[var(--color-text-muted)]">
            {description}
          </p>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <SettingEditor
          setting={setting}
          layers={layers}
          behaviors={behaviors}
          onChange={queueMemoryWrite}
        />
        {showDefaultHint && (
          <DefaultValueHint
            displayValue={defaultDisplayValue}
            onApply={() => queueMemoryWrite(defaultValue)}
          />
        )}
      </div>
    </div>
  );
}

export interface CustomSettingsSectionCardProps {
  section: CustomSettingsSection;
  layers: { id: number; name: string }[];
  behaviors: Map<number, BehaviorDefinition>;
  customSettings: UseCustomSettingsReturn;
  keymapLoading?: boolean;
  // When the card is used as a standalone detail pane (rather than one of many
  // stacked sections), open it expanded so the settings are immediately visible.
  defaultExpanded?: boolean;
}

interface SettingRowListProps {
  settings: Setting[];
  layers: { id: number; name: string }[];
  behaviors: Map<number, BehaviorDefinition>;
  customSettings: UseCustomSettingsReturn;
  describeField?: (field: string) => string | undefined;
  // Fallback used when describeField yields nothing for a setting (generic
  // description derived from key/type; see resolveSettingDescription).
  describeSetting?: (setting: Setting) => string | undefined;
}

function SettingRowList({
  settings,
  layers,
  behaviors,
  customSettings,
  describeField,
  describeSetting,
}: SettingRowListProps) {
  return (
    <>
      {settings.map((setting) => (
        <SettingRow
          key={[
            setting.customSubsystemIndex,
            setting.key,
            setting.source,
            setting.value?.arrayValue?.index ?? "scalar",
          ].join(":")}
          setting={setting}
          description={
            describeField?.(fieldName(setting.key)) ??
            describeSetting?.(setting)
          }
          layers={layers}
          behaviors={behaviors}
          onWrite={customSettings.writeSettingToMemory}
        />
      ))}
    </>
  );
}

export function CustomSettingsSectionCard({
  section,
  layers,
  behaviors,
  customSettings,
  keymapLoading = false,
  defaultExpanded = false,
}: CustomSettingsSectionCardProps) {
  const { t, language } = useLanguage();
  // Collapsed by default — a keyboard can report many subsystems with many
  // settings each, so showing them all expanded is overwhelming. When rendered
  // as a standalone detail pane, callers pass defaultExpanded to open it.
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const withScrollPin = useScrollPin(customSettings.isLoading);
  const hasUnsavedChanges = section.settings.some(
    (setting) => setting.hasUnsavedValue,
  );
  // Blue summary: nothing is queued in memory, but at least one persisted value
  // differs from its compile-time default (device reports defaultValue).
  const hasModifiedFromDefault = section.settings.some(
    (setting) => setting.defaultValue !== undefined,
  );

  // The same setting can be reported by more than one split side (source);
  // rather than listing every copy inline, the user picks one source and the
  // list shows only that side's settings. Central (0) sorts first.
  const availableSources = Array.from(
    new Set(section.settings.map((setting) => setting.source)),
  ).sort((a, b) => sourceSortValue(a) - sourceSortValue(b));
  const [selectedSource, setSelectedSource] = useState<number | null>(null);
  const activeSource =
    selectedSource !== null && availableSources.includes(selectedSource)
      ? selectedSource
      : availableSources[0];

  const sortedSettings = [...section.settings]
    .filter((setting) => setting.source === activeSource)
    .sort((a, b) => settingSortValue(a).localeCompare(settingSortValue(b)));

  const isPmw3610 = section.identifier === PMW3610_CUSTOM_SETTINGS_IDENTIFIER;
  const groups = isPmw3610
    ? PMW3610_SETTING_GROUPS.map((group) => ({
        ...group,
        settings: sortedSettings
          .filter((setting) => group.fields.includes(fieldName(setting.key)))
          .sort(
            (a, b) =>
              group.fields.indexOf(fieldName(a.key)) -
              group.fields.indexOf(fieldName(b.key)),
          ),
      })).filter((group) => group.settings.length > 0)
    : null;
  const groupedKeys = new Set(groups?.flatMap((group) => group.settings));
  const ungroupedSettings = groups
    ? sortedSettings.filter((setting) => !groupedKeys.has(setting))
    : sortedSettings;

  const sectionDescription = SECTION_DESCRIPTIONS[section.identifier];

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] p-4 md:flex-row md:items-center md:justify-between">
        <button
          type="button"
          className="flex min-w-0 items-center gap-2 text-left"
          onClick={() => setIsExpanded((expanded) => !expanded)}
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <IconChevronDown
              size={18}
              className="flex-shrink-0 text-[var(--color-text-muted)]"
            />
          ) : (
            <IconChevronRight
              size={18}
              className="flex-shrink-0 text-[var(--color-text-muted)]"
            />
          )}
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium text-[var(--color-text)]">
              {section.identifier}
            </h4>
            {sectionDescription && (
              <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
                {pickText(sectionDescription, language)}
              </p>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("{{count}} settings", {
                count: section.settings.length,
              })}
              {keymapLoading ? t(" - loading layer and behavior names") : ""}
            </p>
          </div>
        </button>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasUnsavedChanges ? (
            <StatusBadge status="unsaved" />
          ) : hasModifiedFromDefault ? (
            <StatusBadge status="modified" />
          ) : null}
          <button
            type="button"
            className="btn-electric flex items-center gap-2 px-3 py-2 text-sm"
            disabled={customSettings.isLoading || !hasUnsavedChanges}
            onClick={(event) =>
              void withScrollPin(event.currentTarget, () =>
                customSettings.saveSection(section.customSubsystemIndex),
              )
            }
          >
            <IconDeviceFloppy size={16} />
            {t("Save")}
          </button>
          <button
            type="button"
            className="btn-ghost flex items-center gap-2 border border-[var(--color-border)] text-sm"
            disabled={customSettings.isLoading}
            onClick={(event) =>
              void withScrollPin(event.currentTarget, () =>
                customSettings.discardSection(section.customSubsystemIndex),
              )
            }
          >
            <IconRefresh size={16} />
            {t("Discard")}
          </button>
          <button
            type="button"
            className="btn-ghost flex items-center gap-2 border border-red-500/30 text-sm text-red-400"
            disabled={customSettings.isLoading}
            onClick={(event) => {
              if (
                window.confirm(
                  t("Reset all settings in {{identifier}}?", {
                    identifier: section.identifier,
                  }),
                )
              ) {
                void withScrollPin(event.currentTarget, () =>
                  customSettings.resetSection(section.customSubsystemIndex),
                );
              }
            }}
          >
            <IconRotateClockwise size={16} />
            {t("Reset")}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="px-4 pb-2">
          {availableSources.length > 1 && (
            <div className="flex flex-wrap items-center gap-2 py-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                {t("Source")}
              </span>
              <div className="inline-flex rounded-md border border-[var(--color-border)] p-0.5">
                {availableSources.map((source) => {
                  const isActive = source === activeSource;
                  return (
                    <button
                      key={source}
                      type="button"
                      onClick={() => setSelectedSource(source)}
                      className={`rounded px-2 py-0.5 text-xs transition-colors ${
                        isActive
                          ? "bg-[var(--color-electric)]/20 text-[var(--color-electric)]"
                          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      }`}
                    >
                      {sourceLabel(source, t)}
                    </button>
                  );
                })}
              </div>
              <InfoTooltip label={t("What Source means")}>
                <div className="mb-1 font-semibold text-[var(--color-electric)]">
                  {t("Source legend")}
                </div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>{t("Central: the split side you are connected to.")}</li>
                  <li>
                    {t(
                      "Peripheral N: another split side's own independently stored copy.",
                    )}
                  </li>
                </ul>
              </InfoTooltip>
            </div>
          )}

          {groups?.map((group) => (
            <div key={group.title} className="mt-4 first:mt-2">
              <div className="pb-1">
                <h5 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-electric)]">
                  {t(group.title)}
                </h5>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  {t(group.description)}
                </p>
              </div>
              <div className="border-l-2 border-[var(--color-border)] pl-4">
                <SettingRowList
                  settings={group.settings}
                  layers={layers}
                  behaviors={behaviors}
                  customSettings={customSettings}
                  describeField={(field) => {
                    const description = PMW3610_FIELD_DESCRIPTIONS[field];
                    return description ? t(description) : undefined;
                  }}
                  describeSetting={(setting) =>
                    resolveSettingDescription(
                      setting,
                      language,
                      section.identifier,
                    )
                  }
                />
              </div>
            </div>
          ))}

          {ungroupedSettings.length > 0 && (
            <div className={groups ? "mt-4" : ""}>
              <SettingRowList
                settings={ungroupedSettings}
                layers={layers}
                behaviors={behaviors}
                customSettings={customSettings}
                describeSetting={(setting) =>
                  resolveSettingDescription(
                    setting,
                    language,
                    section.identifier,
                  )
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function AdvancedSettingsSection() {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  // Latch true once the section is first opened and stay true (a collapsed
  // reopen shouldn't re-fetch).
  const [hasExpanded, setHasExpanded] = useState(false);
  // Defer loading custom settings until the section is first expanded so
  // opening the Settings tab doesn't trigger the custom-settings RPC.
  const customSettings = useCustomSettings({ autoLoad: false });
  const { keymap, behaviors, isLoading: keymapLoading } = useKeymap();

  const handleToggle = () => {
    setIsExpanded((expanded) => !expanded);
    setHasExpanded(true);
  };

  // Once expanded, load reactively — mirroring the hook's default auto-load —
  // so a not-yet-ready subsystem still loads once it becomes ready.
  const { loadSettings } = customSettings;
  useEffect(() => {
    if (hasExpanded) {
      void loadSettings();
    }
  }, [hasExpanded, loadSettings]);

  const layers = useMemo(
    () =>
      keymap?.layers.map((layer) => ({
        id: layer.id,
        name: layer.name || t("Layer {{id}}", { id: layer.id }),
      })) ?? [],
    [keymap?.layers, t],
  );

  return (
    <div className="glass-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 p-6 text-left"
        onClick={handleToggle}
        aria-expanded={isExpanded}
      >
        <div>
          <h3 className="text-sm font-medium text-[var(--color-text)]">
            {t("Advanced Settings")}
          </h3>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {t(
              "Changes are written to keyboard memory after a short delay. Save a section to persist them.",
            )}
          </p>
        </div>
        {isExpanded ? (
          <IconChevronDown
            size={20}
            className="flex-shrink-0 text-[var(--color-text-muted)]"
          />
        ) : (
          <IconChevronRight
            size={20}
            className="flex-shrink-0 text-[var(--color-text-muted)]"
          />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-4 border-t border-[var(--color-border)] p-6 pt-4">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-ghost flex flex-shrink-0 items-center gap-2 border border-[var(--color-border)] text-sm"
              onClick={customSettings.loadSettings}
              disabled={customSettings.isLoading}
            >
              {customSettings.isLoading ? (
                <IconLoader2 size={16} className="animate-spin" />
              ) : (
                <IconRefresh size={16} />
              )}
              {t("Reload")}
            </button>
          </div>

          <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <IconAlertTriangleFilled
              size={18}
              className="mt-0.5 flex-shrink-0 text-amber-400"
            />
            <p className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              {t(
                "Advanced settings can change firmware behavior immediately. Incorrect values may make the keyboard hard to use; discard or reset a section if the device starts behaving unexpectedly.",
              )}
            </p>
          </div>

          {!customSettings.isAvailable ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t(
                "Custom settings subsystem is not available for this keyboard.",
              )}
            </p>
          ) : customSettings.isLoading &&
            customSettings.sections.length === 0 ? (
            <LoadingIndicator
              variant="inline"
              label={t("Loading advanced settings...")}
            />
          ) : customSettings.sections.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("No advanced settings were reported by the keyboard.")}
            </p>
          ) : (
            <div className="space-y-6">
              {customSettings.sections.map((section) => (
                <CustomSettingsSectionCard
                  key={section.customSubsystemIndex}
                  section={section}
                  layers={layers}
                  behaviors={behaviors}
                  customSettings={customSettings}
                  keymapLoading={keymapLoading}
                />
              ))}
            </div>
          )}

          {customSettings.error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
              <p className="text-sm text-red-400">{t(customSettings.error)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
