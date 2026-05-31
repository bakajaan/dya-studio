import {
  Notification,
  Request,
  Response,
  Setting,
  SettingConstraint,
  SettingNotificationKind,
  SettingScalarValue,
  SettingScope,
  SettingValue,
} from "../../proto/cormoran/zmk/custom_settings/custom_settings";
import { CUSTOM_SETTINGS_SOURCE_ALL } from "../../hooks/useCustomSettings";

export const CUSTOM_SETTINGS_IDENTIFIER = "cormoran_custom_settings";
export const CUSTOM_SETTINGS_SAMPLE_IDENTIFIER = "zmk_config_sample";

const SAMPLE_SUBSYSTEM_INDEX = 7;
const SOURCES = [0, 1, 2];

const RANGE_0_100: SettingConstraint = {
  range: {
    min: { int32Value: 0 },
    max: { int32Value: 100 },
  },
};

const LAYER_ID: SettingConstraint = {
  layerId: {},
};

const KEYBOARD_HID_USAGE: SettingConstraint = {
  hidUsage: {
    usagePage: 0x07,
    usageMin: 0x04,
    usageMax: 0x73,
  },
};

const MODE_OPTIONS: SettingConstraint = {
  options: {
    values: [
      { stringValue: "slow" },
      { stringValue: "normal" },
      { stringValue: "fast" },
    ],
    labels: ["Slow", "Normal", "Fast"],
  },
};

interface DemoSettingTemplate {
  key: string;
  valueForSource: (source: number) => SettingValue;
  constraints?: SettingConstraint[];
}

const TEMPLATES: DemoSettingTemplate[] = [
  {
    key: "speed",
    valueForSource: (source) => ({ int32Value: source === 2 ? 45 : 35 }),
    constraints: [RANGE_0_100],
  },
  {
    key: "enabled",
    valueForSource: (source) => ({ boolValue: source !== 2 }),
  },
  {
    key: "mode",
    valueForSource: () => ({ stringValue: "normal" }),
    constraints: [MODE_OPTIONS],
  },
  {
    key: "layers",
    valueForSource: (source) => ({
      arrayValue: {
        index: 0,
        size: 2,
        value: { int32Value: source },
      },
    }),
    constraints: [LAYER_ID],
  },
  {
    key: "layers",
    valueForSource: (source) => ({
      arrayValue: {
        index: 1,
        size: 2,
        value: { int32Value: source + 1 },
      },
    }),
    constraints: [LAYER_ID],
  },
  {
    key: "tap_key",
    valueForSource: () => ({ int32Value: 0x00070004 }),
    constraints: [KEYBOARD_HID_USAGE],
  },
];

export class CustomSettingsHandler {
  private defaults = TEMPLATES.flatMap((template) =>
    SOURCES.map((source) => createSetting(template, source)),
  );
  private persistedSettings = cloneSettings(this.defaults);
  private settings = TEMPLATES.flatMap((template) =>
    SOURCES.map((source) => createSetting(template, source)),
  );
  private callbacks: ((data: Uint8Array) => void)[] = [];

  process(request: Request): Response {
    if (request.listSettings) {
      const listed = this.filterSettings(request.listSettings.scope);
      listed.forEach((setting, index) => {
        setTimeout(() => {
          this.callbacks.forEach((callback) =>
            callback(
              Notification.encode({
                setting: {
                  kind: SettingNotificationKind.SETTING_NOTIFICATION_KIND_LIST_ITEM,
                  setting,
                },
              }).finish(),
            ),
          );
        }, 25 * index);
      });

      return {
        status: {
          affectedCount: listed.length,
          message: "OK",
        },
      };
    }

    if (request.writeSetting?.setting && request.writeSetting.value) {
      const settingRef = request.writeSetting.setting;
      const targetSources =
        settingRef.source === CUSTOM_SETTINGS_SOURCE_ALL
          ? SOURCES
          : [settingRef.source ?? 0];
      let affectedCount = 0;

      this.settings = this.settings.map((setting) => {
        if (
          setting.customSubsystemIndex !== settingRef.customSubsystemIndex ||
          setting.key !== settingRef.key ||
          !targetSources.includes(setting.source) ||
          arrayIndex(setting) !== settingRef.arrayIndex
        ) {
          return setting;
        }

        affectedCount += 1;
        return {
          ...setting,
          value: normalizeValueForSetting(
            setting,
            request.writeSetting!.value!,
          ),
          hasUnsavedValue:
            request.writeSetting!.mode === 0 ? true : setting.hasUnsavedValue,
        };
      });

      if (request.writeSetting.mode === 1) {
        this.persistedSettings = cloneSettings(this.settings);
        this.settings = this.settings.map((setting) => ({
          ...setting,
          hasUnsavedValue: false,
        }));
      }

      return {
        status: {
          affectedCount,
          message: affectedCount > 0 ? "OK" : "No matching setting",
        },
      };
    }

    if (request.saveSettings) {
      const scoped = this.filterSettings(request.saveSettings.scope);
      this.persistedSettings = this.persistedSettings.map((persisted) => {
        const current = scoped.find((setting) =>
          sameSetting(setting, persisted),
        );
        return current ? { ...current, hasUnsavedValue: false } : persisted;
      });
      this.settings = this.settings.map((setting) =>
        scoped.some((candidate) => sameSetting(candidate, setting))
          ? { ...setting, hasUnsavedValue: false }
          : setting,
      );
      return { status: { affectedCount: scoped.length, message: "OK" } };
    }

    if (request.discardSettings) {
      const scoped = this.filterSettings(request.discardSettings.scope);
      this.settings = this.settings.map((setting) => {
        if (!scoped.some((candidate) => sameSetting(candidate, setting))) {
          return setting;
        }
        return (
          this.persistedSettings.find((persisted) =>
            sameSetting(persisted, setting),
          ) ?? setting
        );
      });
      return { status: { affectedCount: scoped.length, message: "OK" } };
    }

    if (request.resetSettings) {
      const scoped = this.filterSettings(request.resetSettings.scope);
      this.settings = this.settings.map((setting) => {
        if (!scoped.some((candidate) => sameSetting(candidate, setting))) {
          return setting;
        }
        const defaultSetting = this.defaults.find((candidate) =>
          sameSetting(candidate, setting),
        );
        return defaultSetting
          ? { ...defaultSetting, hasUnsavedValue: true }
          : setting;
      });
      return { status: { affectedCount: scoped.length, message: "OK" } };
    }

    return { error: { message: "Not implemented" } };
  }

  notify(callback: (data: Uint8Array) => void) {
    this.callbacks.push(callback);
  }

  private filterSettings(scope: SettingScope | undefined = {}) {
    return this.settings.filter((setting) => {
      if (
        scope.customSubsystemIndex !== undefined &&
        setting.customSubsystemIndex !== scope.customSubsystemIndex
      ) {
        return false;
      }
      if (scope.key !== undefined && setting.key !== scope.key) {
        return false;
      }
      if (
        scope.keyPrefix !== undefined &&
        !setting.key.startsWith(scope.keyPrefix)
      ) {
        return false;
      }
      if (
        scope.source !== undefined &&
        scope.source !== CUSTOM_SETTINGS_SOURCE_ALL &&
        setting.source !== scope.source
      ) {
        return false;
      }
      return true;
    });
  }
}

function sameSetting(a: Setting, b: Setting): boolean {
  return (
    a.customSubsystemIndex === b.customSubsystemIndex &&
    a.key === b.key &&
    a.source === b.source &&
    arrayIndex(a) === arrayIndex(b)
  );
}

function cloneSettings(settings: Setting[]): Setting[] {
  return JSON.parse(JSON.stringify(settings)) as Setting[];
}

function createSetting(template: DemoSettingTemplate, source: number): Setting {
  return {
    customSubsystemIndex: SAMPLE_SUBSYSTEM_INDEX,
    key: template.key,
    source,
    hasUnsavedValue: false,
    meta: {
      confidentiality: 2,
      readPermission: 0,
      writePermission: 0,
      constraints: template.constraints ?? [],
    },
    value: template.valueForSource(source),
  };
}

function arrayIndex(setting: Setting): number | undefined {
  return setting.value?.arrayValue?.index;
}

function normalizeValueForSetting(
  setting: Setting,
  value: SettingValue,
): SettingValue {
  const existingArray = setting.value?.arrayValue;
  if (!existingArray) {
    return scalarValue(value);
  }

  return {
    arrayValue: {
      index: existingArray.index,
      size: existingArray.size,
      value: scalarValue(value.arrayValue?.value ?? value),
    },
  };
}

function scalarValue(value: SettingScalarValue): SettingScalarValue {
  if (value.int32Value !== undefined) return { int32Value: value.int32Value };
  if (value.boolValue !== undefined) return { boolValue: value.boolValue };
  if (value.stringValue !== undefined)
    return { stringValue: value.stringValue };
  if (value.bytesValue !== undefined) return { bytesValue: value.bytesValue };
  return {};
}
