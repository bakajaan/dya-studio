import { useMemo, useState } from "react";
import { IconRefresh } from "@tabler/icons-react";
import {
  CUSTOM_SETTINGS_SOURCE_ALL,
  type UseCustomSettingsReturn,
} from "../hooks/useCustomSettings";
import {
  type Setting,
  type SettingConstraint,
  type SettingConstraintOptions,
  type SettingConstraintRange,
  type SettingScalarValue,
  type SettingValue,
} from "../proto/cormoran/zmk/custom_settings/custom_settings";

interface CustomSettingsSectionProps {
  customSettings: UseCustomSettingsReturn;
}

interface CustomSettingGroup {
  id: string;
  subsystemLabel: string;
  key: string;
  settings: Setting[];
}

interface CustomSubsystemGroup {
  id: string;
  label: string;
  settings: CustomSettingGroup[];
}

type ScalarValueKind = "bytes" | "int32" | "bool" | "string";

export function CustomSettingsSection({
  customSettings,
}: CustomSettingsSectionProps) {
  const {
    isAvailable,
    settings,
    isLoading,
    error,
    loadSettings,
    updateSetting,
    subsystemIdentifierForIndex,
  } = customSettings;

  const groupedSettings = useMemo(
    () => groupSettings(settings, subsystemIdentifierForIndex),
    [settings, subsystemIdentifierForIndex],
  );

  if (!isAvailable) {
    return null;
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Custom Settings
        </h3>
        <button
          className="btn-ghost text-sm flex items-center gap-2"
          onClick={() => void loadSettings()}
          disabled={isLoading}
          aria-label="Refresh custom settings"
        >
          <IconRefresh size={16} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {isLoading && settings.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">
          Loading custom settings...
        </p>
      ) : groupedSettings.length > 0 ? (
        <div className="space-y-6">
          {groupedSettings.map((subsystem) => (
            <div key={subsystem.id} className="space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-2">
                <h4 className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                  {subsystem.label}
                </h4>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {subsystem.settings.length} settings
                </span>
              </div>
              <div className="space-y-3">
                {subsystem.settings.map((group) => (
                  <CustomSettingRow
                    key={group.id}
                    group={group}
                    isLoading={isLoading}
                    onUpdate={updateSetting}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">
          No custom settings are exposed by this keyboard.
        </p>
      )}
    </div>
  );
}

function CustomSettingRow({
  group,
  isLoading,
  onUpdate,
}: {
  group: CustomSettingGroup;
  isLoading: boolean;
  onUpdate: (
    setting: Setting,
    value: SettingValue,
    source: number,
  ) => Promise<void>;
}) {
  const arrayIndices = getArrayIndices(group.settings);
  const [selectedSource, setSelectedSource] = useState(
    CUSTOM_SETTINGS_SOURCE_ALL,
  );
  const [selectedArrayIndexState, setSelectedArrayIndex] = useState(
    arrayIndices[0] ?? 0,
  );
  const selectedArrayIndex = arrayIndices.includes(selectedArrayIndexState)
    ? selectedArrayIndexState
    : (arrayIndices[0] ?? 0);
  const selectedSetting = getSelectedSetting(
    group.settings,
    selectedArrayIndex,
    selectedSource,
  );
  const selectedScalar = scalarFromSetting(selectedSetting);
  const selectedKind = scalarValueKind(selectedScalar);
  const selectedValueKey = `${selectedSetting?.source ?? "none"}:${
    selectedSetting?.customSubsystemIndex ?? "none"
  }:${selectedSetting?.key ?? "none"}:${selectedArrayIndex}:${
    selectedScalar ? scalarValueToInput(selectedScalar) : ""
  }`;
  const initialValueText = selectedScalar
    ? scalarValueToInput(selectedScalar)
    : "";
  const [valueDraft, setValueDraft] = useState({ key: "", value: "" });
  const valueText =
    valueDraft.key === selectedValueKey ? valueDraft.value : initialValueText;
  const setValueText = (value: string) =>
    setValueDraft({ key: selectedValueKey, value });

  const sourceOptions = getSourceOptions(group.settings);
  const optionConstraint = getOptionsConstraint(selectedSetting);
  const rangeConstraint = getRangeConstraint(selectedSetting);
  const hidConstraint = selectedSetting?.meta?.constraints.find(
    (constraint) => constraint.hidUsage,
  )?.hidUsage;
  const validationMessage = validateInput(
    valueText,
    selectedKind,
    selectedSetting?.meta?.constraints ?? [],
  );
  const isHidden = selectedSetting !== undefined && !selectedSetting.value;
  const canUpdate =
    selectedSetting !== undefined &&
    selectedKind !== undefined &&
    !isHidden &&
    !validationMessage &&
    !isLoading;

  const handleUpdate = async () => {
    if (!selectedSetting || !selectedKind || validationMessage) {
      return;
    }

    const scalarValue = parseScalarValue(valueText, selectedKind);
    const arrayValue = selectedSetting.value?.arrayValue;
    const value: SettingValue = arrayValue
      ? {
          arrayValue: {
            index: arrayValue.index,
            size: arrayValue.size,
            value: scalarValue,
          },
        }
      : scalarValue;

    await onUpdate(selectedSetting, value, selectedSource);
  };

  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <p className="text-sm font-medium text-[var(--color-text)] font-mono break-all">
              {group.key}
              {arrayIndices.length > 0 ? "[]" : ""}
            </p>
            {group.settings.some((setting) => setting.hasUnsavedValue) && (
              <span className="px-2 py-0.5 rounded text-[10px] uppercase tracking-wide bg-[var(--color-electric)]/10 text-[var(--color-electric)]">
                unsaved
              </span>
            )}
          </div>
          <div className="space-y-1">
            {getValuesBySource(group.settings).map((entry) => (
              <div
                key={entry.source}
                className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-xs"
              >
                <span className="text-[var(--color-text-muted)]">
                  {formatSource(entry.source)}
                </span>
                <span className="font-mono text-[var(--color-text-secondary)] break-all">
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-[var(--color-text-muted)]">
              Target
              <select
                className="input-field mt-1 w-full text-sm"
                value={selectedSource}
                onChange={(event) =>
                  setSelectedSource(Number(event.target.value))
                }
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {formatSource(source)}
                  </option>
                ))}
              </select>
            </label>

            {arrayIndices.length > 0 ? (
              <label className="text-xs text-[var(--color-text-muted)]">
                Element
                <select
                  className="input-field mt-1 w-full text-sm"
                  value={selectedArrayIndex}
                  onChange={(event) =>
                    setSelectedArrayIndex(Number(event.target.value))
                  }
                >
                  {arrayIndices.map((index) => (
                    <option key={index} value={index}>
                      {index}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="text-xs text-[var(--color-text-muted)]">
                Type
                <div className="input-field mt-1 w-full text-sm flex items-center">
                  {selectedKind ?? "hidden"}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-[var(--color-text-muted)]">
              Value
              {renderValueInput({
                valueText,
                selectedKind,
                optionConstraint,
                rangeConstraint,
                isHidden,
                onChange: setValueText,
              })}
            </label>
            {constraintSummary(selectedSetting) && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                {constraintSummary(selectedSetting)}
              </p>
            )}
            {hidConstraint && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                HID page {hidConstraint.usagePage}, usage{" "}
                {hidConstraint.usageMin}-{hidConstraint.usageMax}
              </p>
            )}
            {validationMessage && (
              <p className="text-[11px] text-red-400 mt-1">
                {validationMessage}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              className="btn-electric text-sm"
              onClick={() => void handleUpdate()}
              disabled={!canUpdate}
            >
              {isLoading ? "Updating..." : "Update"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function renderValueInput({
  valueText,
  selectedKind,
  optionConstraint,
  rangeConstraint,
  isHidden,
  onChange,
}: {
  valueText: string;
  selectedKind: ScalarValueKind | undefined;
  optionConstraint: SettingConstraintOptions | undefined;
  rangeConstraint: SettingConstraintRange | undefined;
  isHidden: boolean;
  onChange: (value: string) => void;
}) {
  if (isHidden || !selectedKind) {
    return (
      <input
        className="input-field mt-1 w-full text-sm"
        value="hidden"
        disabled
        readOnly
      />
    );
  }

  if (optionConstraint) {
    return (
      <select
        className="input-field mt-1 w-full text-sm"
        value={valueText}
        onChange={(event) => onChange(event.target.value)}
      >
        {optionConstraint.values.map((option, index) => (
          <option
            key={scalarValueToInput(option)}
            value={scalarValueToInput(option)}
          >
            {optionConstraint.labels[index] || formatScalarValue(option)}
          </option>
        ))}
      </select>
    );
  }

  if (selectedKind === "bool") {
    return (
      <select
        className="input-field mt-1 w-full text-sm"
        value={valueText}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  if (selectedKind === "int32") {
    return (
      <input
        className="input-field mt-1 w-full text-sm"
        type="number"
        step={1}
        min={rangeConstraint?.min?.int32Value}
        max={rangeConstraint?.max?.int32Value}
        value={valueText}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <input
      className="input-field mt-1 w-full text-sm"
      value={valueText}
      maxLength={selectedKind === "string" ? 64 : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function groupSettings(
  settings: Setting[],
  subsystemIdentifierForIndex: (index: number) => string,
): CustomSubsystemGroup[] {
  const subsystemMap = new Map<string, CustomSubsystemGroup>();

  for (const setting of settings) {
    const subsystemLabel = subsystemIdentifierForIndex(
      setting.customSubsystemIndex,
    );
    const subsystemId = `${setting.customSubsystemIndex}:${subsystemLabel}`;
    const subsystemGroup =
      subsystemMap.get(subsystemId) ??
      ({
        id: subsystemId,
        label: subsystemLabel,
        settings: [],
      } satisfies CustomSubsystemGroup);
    subsystemMap.set(subsystemId, subsystemGroup);

    const settingId = `${subsystemId}:${setting.key}`;
    let settingGroup = subsystemGroup.settings.find(
      (candidate) => candidate.id === settingId,
    );
    if (!settingGroup) {
      settingGroup = {
        id: settingId,
        subsystemLabel,
        key: setting.key,
        settings: [],
      };
      subsystemGroup.settings.push(settingGroup);
    }
    settingGroup.settings.push(setting);
  }

  return Array.from(subsystemMap.values()).map((subsystem) => ({
    ...subsystem,
    settings: subsystem.settings.sort((a, b) => a.key.localeCompare(b.key)),
  }));
}

function getSourceOptions(settings: Setting[]): number[] {
  return [
    CUSTOM_SETTINGS_SOURCE_ALL,
    ...Array.from(new Set(settings.map((setting) => setting.source))).sort(
      (a, b) => sourceSortValue(a) - sourceSortValue(b),
    ),
  ];
}

function getArrayIndices(settings: Setting[]): number[] {
  return Array.from(
    new Set(
      settings
        .map((setting) => setting.value?.arrayValue?.index)
        .filter((index): index is number => index !== undefined),
    ),
  ).sort((a, b) => a - b);
}

function getSelectedSetting(
  settings: Setting[],
  selectedArrayIndex: number,
  selectedSource: number,
): Setting | undefined {
  const candidates = settings.filter((setting) => {
    const arrayIndex = setting.value?.arrayValue?.index;
    return arrayIndex === undefined || arrayIndex === selectedArrayIndex;
  });

  if (selectedSource !== CUSTOM_SETTINGS_SOURCE_ALL) {
    const sourceSetting = candidates.find(
      (setting) => setting.source === selectedSource,
    );
    if (sourceSetting) {
      return sourceSetting;
    }
  }

  return candidates.find((setting) => setting.source === 0) ?? candidates[0];
}

function getValuesBySource(
  settings: Setting[],
): { source: number; value: string }[] {
  const bySource = new Map<number, Setting[]>();

  for (const setting of settings) {
    const sourceSettings = bySource.get(setting.source) ?? [];
    sourceSettings.push(setting);
    bySource.set(setting.source, sourceSettings);
  }

  return Array.from(bySource.entries())
    .sort((a, b) => sourceSortValue(a[0]) - sourceSortValue(b[0]))
    .map(([source, sourceSettings]) => ({
      source,
      value: formatSourceSettings(sourceSettings),
    }));
}

function formatSourceSettings(settings: Setting[]): string {
  const sorted = [...settings].sort(
    (a, b) =>
      (a.value?.arrayValue?.index ?? -1) - (b.value?.arrayValue?.index ?? -1),
  );

  if (sorted.some((setting) => setting.value?.arrayValue)) {
    return sorted
      .map((setting) =>
        setting.value?.arrayValue
          ? `[${setting.value.arrayValue.index}] ${formatScalarValue(
              setting.value.arrayValue.value ?? {},
            )}`
          : formatValue(setting.value),
      )
      .join(", ");
  }

  return formatValue(sorted[0]?.value);
}

function formatValue(value: SettingValue | undefined): string {
  if (!value) {
    return "(hidden)";
  }
  return formatScalarValue(value.arrayValue?.value ?? value);
}

function scalarFromSetting(
  setting: Setting | undefined,
): SettingScalarValue | undefined {
  return setting?.value?.arrayValue?.value ?? setting?.value;
}

function scalarValueKind(
  value: SettingScalarValue | undefined,
): ScalarValueKind | undefined {
  if (!value) {
    return undefined;
  }
  if (value.int32Value !== undefined) return "int32";
  if (value.boolValue !== undefined) return "bool";
  if (value.stringValue !== undefined) return "string";
  if (value.bytesValue !== undefined) return "bytes";
  return undefined;
}

function scalarValueToInput(value: SettingScalarValue): string {
  if (value.int32Value !== undefined) return `${value.int32Value}`;
  if (value.boolValue !== undefined) return value.boolValue ? "true" : "false";
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return formatBytesValue(value.bytesValue);
  return "";
}

function formatScalarValue(value: SettingScalarValue): string {
  if (value.int32Value !== undefined) return `${value.int32Value}`;
  if (value.boolValue !== undefined) return value.boolValue ? "true" : "false";
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.bytesValue !== undefined) return formatBytesValue(value.bytesValue);
  return "";
}

function parseScalarValue(
  value: string,
  kind: ScalarValueKind,
): SettingScalarValue {
  switch (kind) {
    case "bytes":
      return { bytesValue: parseBytesValue(value) };
    case "bool":
      return { boolValue: value === "true" || value === "1" };
    case "string":
      return { stringValue: value };
    case "int32":
      return { int32Value: Number.parseInt(value, 10) };
  }
}

function parseBytesValue(value: string): Uint8Array {
  const trimmed = value.trim();
  if (trimmed.length === 0) return new Uint8Array();

  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  if (
    tokens.length > 0 &&
    tokens.every((token) => /^[0-9a-fA-F]{1,2}$/.test(token))
  ) {
    return Uint8Array.from(tokens.map((token) => Number.parseInt(token, 16)));
  }

  return new TextEncoder().encode(value);
}

function formatBytesValue(value: Uint8Array): string {
  return Array.from(value)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(" ");
}

function getOptionsConstraint(
  setting: Setting | undefined,
): SettingConstraintOptions | undefined {
  return setting?.meta?.constraints.find((constraint) => constraint.options)
    ?.options;
}

function getRangeConstraint(
  setting: Setting | undefined,
): SettingConstraintRange | undefined {
  return setting?.meta?.constraints.find((constraint) => constraint.range)
    ?.range;
}

function validateInput(
  value: string,
  kind: ScalarValueKind | undefined,
  constraints: SettingConstraint[],
): string | null {
  if (!kind) {
    return null;
  }

  const options = constraints.find((constraint) => constraint.options)?.options;
  if (options) {
    const allowed = new Set(options.values.map(scalarValueToInput));
    if (!allowed.has(value)) {
      return "Value is not one of the allowed options.";
    }
  }

  if (kind === "int32") {
    const intValue = Number(value);
    if (!Number.isInteger(intValue)) {
      return "Value must be an integer.";
    }

    const range = constraints.find((constraint) => constraint.range)?.range;
    const min = range?.min?.int32Value;
    const max = range?.max?.int32Value;
    if (min !== undefined && intValue < min) {
      return `Value must be at least ${min}.`;
    }
    if (max !== undefined && intValue > max) {
      return `Value must be at most ${max}.`;
    }

    const hidUsage = constraints.find(
      (constraint) => constraint.hidUsage,
    )?.hidUsage;
    if (hidUsage) {
      const usagePage = (intValue >>> 16) & 0xffff;
      const usage = intValue & 0xffff;
      if (
        usagePage !== hidUsage.usagePage ||
        usage < hidUsage.usageMin ||
        usage > hidUsage.usageMax
      ) {
        return "Value must match the HID usage constraint.";
      }
    }
  }

  if (kind === "string" && new TextEncoder().encode(value).length > 64) {
    return "Value must be 64 bytes or fewer.";
  }

  if (kind === "bytes" && parseBytesValue(value).length > 64) {
    return "Value must be 64 bytes or fewer.";
  }

  return null;
}

function constraintSummary(setting: Setting | undefined): string | null {
  const constraints = setting?.meta?.constraints ?? [];
  const range = constraints.find((constraint) => constraint.range)?.range;
  if (
    range?.min?.int32Value !== undefined &&
    range.max?.int32Value !== undefined
  ) {
    return `Range ${range.min.int32Value}-${range.max.int32Value}`;
  }

  const options = constraints.find((constraint) => constraint.options)?.options;
  if (options) {
    return `${options.values.length} options`;
  }

  if (constraints.some((constraint) => constraint.layerId)) {
    return "Layer ID";
  }

  if (constraints.some((constraint) => constraint.behaviorId)) {
    return "Behavior ID";
  }

  return null;
}

function formatSource(source: number): string {
  if (source === CUSTOM_SETTINGS_SOURCE_ALL) return "All";
  if (source === 0) return "Central";
  return `Peripheral ${source}`;
}

function sourceSortValue(source: number): number {
  if (source === 0) return -1;
  if (source === CUSTOM_SETTINGS_SOURCE_ALL) return Number.MAX_SAFE_INTEGER;
  return source;
}
