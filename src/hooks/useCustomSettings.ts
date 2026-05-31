import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ZMKCustomSubsystem,
  ZMKAppContext,
} from "@cormoran/zmk-studio-react-hook";
import {
  Notification,
  Request,
  Response,
  Setting,
  SettingNotificationKind,
  SettingValue,
  SettingWriteMode,
} from "../proto/cormoran/zmk/custom_settings/custom_settings";

const SUBSYSTEM_IDENTIFIERS = [
  "cormoran_custom_settings",
  "zmk__custom_settings",
];

export const CUSTOM_SETTINGS_SOURCE_ALL = 0xffffffff;

const LIST_NOTIFICATION_TIMEOUT_MS = 750;
const LIST_REQUEST_TIMEOUT_MS = 5000;

export interface UseCustomSettingsReturn {
  isAvailable: boolean;
  settings: Setting[];
  isLoading: boolean;
  error: string | null;
  loadSettings: () => Promise<void>;
  updateSettingMemory: (
    setting: Setting,
    value: SettingValue,
    source: number,
  ) => Promise<void>;
  saveSubsystemSettings: (customSubsystemIndex: number) => Promise<void>;
  discardSubsystemSettings: (customSubsystemIndex: number) => Promise<void>;
  resetSubsystemSettings: (customSubsystemIndex: number) => Promise<void>;
  subsystemIdentifierForIndex: (index: number) => string;
}

interface ListedSubsystem {
  index: number;
  identifier: string;
}

export function useCustomSettings(): UseCustomSettingsReturn {
  const zmkApp = useContext(ZMKAppContext);
  const [settings, setSettings] = useState<Setting[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subsystem = useMemo(
    () =>
      SUBSYSTEM_IDENTIFIERS.map((identifier) =>
        zmkApp?.findSubsystem(identifier),
      ).find((candidate) => candidate !== undefined && candidate !== null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zmkApp?.state.customSubsystems],
  );
  const subsystemIndex = subsystem?.index;

  const subsystemIdentifierForIndex = useCallback(
    (index: number) => {
      const subsystems = getSubsystems(zmkApp?.state.customSubsystems);
      return (
        subsystems.find((candidate) => candidate.index === index)?.identifier ??
        `${index}`
      );
    },
    [zmkApp?.state.customSubsystems],
  );

  const callCustomRequest = useCallback(
    async (request: Request): Promise<Response> => {
      if (!zmkApp?.state.connection || subsystemIndex === undefined) {
        throw new Error("Custom settings subsystem is not available");
      }

      const service = new ZMKCustomSubsystem(
        zmkApp.state.connection,
        subsystemIndex,
      );
      const payload = Request.encode(request).finish();
      const responsePayload = await service.callRPC(payload);
      if (!responsePayload) {
        throw new Error("Empty response");
      }

      const decoded = Response.decode(responsePayload);
      if (decoded.error) {
        throw new Error(
          decoded.error.message || "Custom settings request failed",
        );
      }
      return decoded;
    },
    [zmkApp, subsystemIndex],
  );

  const collectListSettings = useCallback(async (): Promise<Setting[]> => {
    if (!zmkApp || subsystemIndex === undefined) {
      return [];
    }

    const collected: Setting[] = [];
    let expectedCount: number | undefined;
    let quietTimeout: ReturnType<typeof setTimeout> | undefined;
    let isComplete = false;
    let resolveList: () => void = () => {};

    const listComplete = new Promise<void>((resolve) => {
      resolveList = resolve;
    });

    const completeList = () => {
      if (isComplete) {
        return;
      }
      isComplete = true;
      if (quietTimeout) {
        clearTimeout(quietTimeout);
      }
      resolveList();
    };

    const scheduleQuietResolve = () => {
      if (quietTimeout) {
        clearTimeout(quietTimeout);
      }
      quietTimeout = setTimeout(completeList, LIST_NOTIFICATION_TIMEOUT_MS);
    };

    const unsubscribe = zmkApp.onNotification({
      type: "custom",
      subsystemIndex,
      callback: (customNotification) => {
        try {
          const notification = Notification.decode(customNotification.payload);
          if (
            notification.setting?.kind ===
              SettingNotificationKind.SETTING_NOTIFICATION_KIND_LIST_ITEM &&
            notification.setting.setting
          ) {
            collected.push(notification.setting.setting);
            if (
              expectedCount !== undefined &&
              collected.length >= expectedCount
            ) {
              completeList();
            } else {
              scheduleQuietResolve();
            }
          }
        } catch (err) {
          console.error("Failed to decode custom settings notification:", err);
        }
      },
    });

    try {
      const resp = await withTimeout(
        callCustomRequest(
          Request.create({
            listSettings: {
              scope: {
                source: CUSTOM_SETTINGS_SOURCE_ALL,
              },
              requireMeta: true,
            },
          }),
        ),
        LIST_REQUEST_TIMEOUT_MS,
        "Custom settings list request timed out",
      );
      expectedCount = resp.status?.affectedCount;

      if (expectedCount !== undefined && collected.length >= expectedCount) {
        completeList();
      } else {
        scheduleQuietResolve();
      }

      await listComplete;
      return sortSettings(collected);
    } finally {
      unsubscribe();
      if (quietTimeout) {
        clearTimeout(quietTimeout);
      }
    }
  }, [zmkApp, subsystemIndex, callCustomRequest]);

  const loadSettings = useCallback(async () => {
    if (!zmkApp?.state.connection || subsystemIndex === undefined) {
      setSettings([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      setSettings(await collectListSettings());
    } catch (err) {
      console.error("Failed to load custom settings:", err);
      setError(
        `Failed to load custom settings: ${
          err instanceof Error ? err.message : "Unknown error"
        }`,
      );
    } finally {
      setIsLoading(false);
    }
  }, [zmkApp?.state.connection, subsystemIndex, collectListSettings]);

  const updateSettingMemory = useCallback(
    async (setting: Setting, value: SettingValue, source: number) => {
      if (!zmkApp?.state.connection || subsystemIndex === undefined) {
        setError("Not connected to device or subsystem not found");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const arrayIndex = setting.value?.arrayValue?.index;
        await callCustomRequest(
          Request.create({
            writeSetting: {
              setting: {
                customSubsystemIndex: setting.customSubsystemIndex,
                key: setting.key,
                source,
                arrayIndex,
              },
              value,
              mode: SettingWriteMode.SETTING_WRITE_MODE_MEMORY,
            },
          }),
        );
        setSettings(await collectListSettings());
      } catch (err) {
        console.error("Failed to update custom setting:", err);
        setError(
          `Failed to update custom setting: ${
            err instanceof Error ? err.message : "Unknown error"
          }`,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [
      zmkApp?.state.connection,
      subsystemIndex,
      callCustomRequest,
      collectListSettings,
    ],
  );

  const saveSubsystemSettings = useCallback(
    async (customSubsystemIndex: number) => {
      await sendScopeRequest(
        customSubsystemIndex,
        (scope) => Request.create({ saveSettings: { scope } }),
        "save",
        zmkApp?.state.connection,
        subsystemIndex,
        callCustomRequest,
        collectListSettings,
        setSettings,
        setIsLoading,
        setError,
      );
    },
    [
      zmkApp?.state.connection,
      subsystemIndex,
      callCustomRequest,
      collectListSettings,
    ],
  );

  const discardSubsystemSettings = useCallback(
    async (customSubsystemIndex: number) => {
      await sendScopeRequest(
        customSubsystemIndex,
        (scope) => Request.create({ discardSettings: { scope } }),
        "discard",
        zmkApp?.state.connection,
        subsystemIndex,
        callCustomRequest,
        collectListSettings,
        setSettings,
        setIsLoading,
        setError,
      );
    },
    [
      zmkApp?.state.connection,
      subsystemIndex,
      callCustomRequest,
      collectListSettings,
    ],
  );

  const resetSubsystemSettings = useCallback(
    async (customSubsystemIndex: number) => {
      await sendScopeRequest(
        customSubsystemIndex,
        (scope) => Request.create({ resetSettings: { scope } }),
        "reset",
        zmkApp?.state.connection,
        subsystemIndex,
        callCustomRequest,
        collectListSettings,
        setSettings,
        setIsLoading,
        setError,
      );
    },
    [
      zmkApp?.state.connection,
      subsystemIndex,
      callCustomRequest,
      collectListSettings,
    ],
  );

  useEffect(() => {
    if (subsystemIndex !== undefined && zmkApp?.state.connection) {
      void loadSettings();
    } else {
      setSettings([]);
    }
  }, [subsystemIndex, zmkApp?.state.connection, loadSettings]);

  return {
    isAvailable: subsystemIndex !== undefined,
    settings,
    isLoading,
    error,
    loadSettings,
    updateSettingMemory,
    saveSubsystemSettings,
    discardSubsystemSettings,
    resetSubsystemSettings,
    subsystemIdentifierForIndex,
  };
}

async function sendScopeRequest(
  customSubsystemIndex: number,
  createRequest: (scope: {
    customSubsystemIndex: number;
    source: number;
  }) => Request,
  action: string,
  connection: unknown,
  subsystemIndex: number | undefined,
  callCustomRequest: (request: Request) => Promise<Response>,
  collectListSettings: () => Promise<Setting[]>,
  setSettings: (settings: Setting[]) => void,
  setIsLoading: (value: boolean) => void,
  setError: (value: string | null) => void,
) {
  if (!connection || subsystemIndex === undefined) {
    setError("Not connected to device or subsystem not found");
    return;
  }

  setIsLoading(true);
  setError(null);

  try {
    await callCustomRequest(
      createRequest({
        customSubsystemIndex,
        source: CUSTOM_SETTINGS_SOURCE_ALL,
      }),
    );
    setSettings(await collectListSettings());
  } catch (err) {
    console.error(`Failed to ${action} custom settings:`, err);
    setError(
      `Failed to ${action} custom settings: ${
        err instanceof Error ? err.message : "Unknown error"
      }`,
    );
  } finally {
    setIsLoading(false);
  }
}

function getSubsystems(value: unknown): ListedSubsystem[] {
  const direct = Array.isArray(value) ? value : undefined;
  const nested =
    typeof value === "object" && value !== null && "subsystems" in value
      ? (value as { subsystems?: unknown }).subsystems
      : undefined;
  const candidates = direct ?? (Array.isArray(nested) ? nested : []);

  return candidates.filter(
    (candidate): candidate is ListedSubsystem =>
      typeof candidate === "object" &&
      candidate !== null &&
      "index" in candidate &&
      "identifier" in candidate &&
      typeof (candidate as ListedSubsystem).index === "number" &&
      typeof (candidate as ListedSubsystem).identifier === "string",
  );
}

function sortSettings(settings: Setting[]): Setting[] {
  return [...settings].sort(
    (a, b) =>
      a.customSubsystemIndex - b.customSubsystemIndex ||
      a.key.localeCompare(b.key) ||
      (a.value?.arrayValue?.index ?? -1) - (b.value?.arrayValue?.index ?? -1) ||
      sourceSortValue(a.source) - sourceSortValue(b.source),
  );
}

function sourceSortValue(source: number): number {
  if (source === 0) return -1;
  if (source === CUSTOM_SETTINGS_SOURCE_ALL) return Number.MAX_SAFE_INTEGER;
  return source;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}
