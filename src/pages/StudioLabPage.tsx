/**
 * Lab タブ：Phase 2 で追加した 6 つの機能をまとめて提供する画面。
 *
 * 1. dtsi インポート（zmk-keymap-common → プロファイル）
 * 2. バッテリー残量予測
 * 3. BLE 再接続時間の計測ログ
 * 4. 打鍵統計からの配列改善サジェスト
 * 5. Save 時の自動スナップショット設定
 * 6. デバイス別プロファイル自動切替の紐づけ
 *
 * 実機への書き込みは既存の Keymap タブ（プロファイル適用）に任せ、
 * この画面は localStorage に閉じた安全な操作だけを行う。
 */
import {
  useCallback,
  useContext,
  useMemo,
  useState,
  type ChangeEvent,
} from "react";

import { useLanguage } from "../hooks/useLanguage";
import { labText, type LabKey } from "../i18n/labStrings";
import { ConnectionContext } from "../components/DeviceConnection";
import { importKeymapDtsi } from "../lib/keymapDtsiImport";
import {
  listProfiles,
  upsertProfile,
  type KeymapProfile,
} from "../lib/keymapProfile";
import {
  loadBatteryHistory,
  type BatteryPoint,
} from "../lib/batteryHistoryStore";
import {
  forecastBattery,
  formatHours,
  summarizeDailyDrain,
} from "../lib/batteryForecast";
import {
  clearReconnectEvents,
  formatDurationMs,
  listReconnectEvents,
  summarizeReconnects,
} from "../lib/reconnectMetrics";
import { loadStats } from "../lib/keyUsageStats";
import {
  defaultEffortsForKeyCount,
  suggestSwaps,
} from "../lib/keymapLayoutSuggestions";
import {
  isAutoSnapshotEnabled,
  setAutoSnapshotEnabled,
} from "../lib/autoSnapshot";
import { listSnapshots } from "../lib/keymapSnapshots";
import {
  deviceKeyFor,
  listDeviceProfileBindings,
  removeDeviceProfileBinding,
  resolveAutoProfile,
  setDeviceProfileBinding,
} from "../lib/profileAutoSwitch";

const CARD =
  "rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-4 space-y-3";
const HEADING = "text-sm font-semibold";
const MUTED = "text-xs text-[var(--color-text-muted)]";
const BUTTON =
  "h-8 px-3 rounded-md border border-[var(--color-border)] text-xs transition-colors hover:border-[var(--color-electric)] disabled:opacity-40";
const INPUT =
  "h-8 px-2 rounded-md border border-[var(--color-border)] bg-transparent text-xs";

/** batteryHistoryStore 内の STORAGE_KEY と同じ値（向こうは非公開）。 */
const BATTERY_HISTORY_KEY = "dya-studio-battery-history";

/** Lab タブ専用辞書を引くヘルパー。 */
function useLabText(): (key: LabKey) => string {
  const { language } = useLanguage();
  return useCallback((key: LabKey) => labText(language, key), [language]);
}

function listBatteryDeviceKeys(): string[] {
  try {
    const raw = localStorage.getItem(BATTERY_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return [];
    return Object.keys(parsed as Record<string, unknown>);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* 1. dtsi インポート                                                 */
/* ------------------------------------------------------------------ */

function DtsiImportPanel() {
  const t = useLabText();
  const [text, setText] = useState("");
  const [name, setName] = useState("dtsi-import");
  const [result, setResult] = useState<{
    profile: KeymapProfile;
    warnings: string[];
  } | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const handleFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const content = await file.text();
      setText(content);
      setName(file.name.replace(/\.(keymap|dtsi|overlay)$/, ""));
      setResult(null);
      setSavedName(null);
    },
    [],
  );

  const parse = useCallback(() => {
    setSavedName(null);
    setResult(importKeymapDtsi(text, { name }));
  }, [text, name]);

  const save = useCallback(() => {
    if (!result) return;
    upsertProfile(result.profile);
    setSavedName(result.profile.name);
  }, [result]);

  return (
    <section className={CARD}>
      <h2 className={HEADING}>{t("dtsiTitle")}</h2>
      <p className={MUTED}>{t("dtsiDesc")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".keymap,.dtsi,.overlay,.txt"
          onChange={handleFile}
          className="text-xs"
        />
        <input
          className={INPUT}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("profileName")}
        />
        <button className={BUTTON} onClick={parse} disabled={!text.trim()}>
          {t("parse")}
        </button>
        <button className={BUTTON} onClick={save} disabled={!result}>
          {t("saveAsProfile")}
        </button>
      </div>
      <textarea
        className="w-full h-32 rounded-md border border-[var(--color-border)] bg-transparent p-2 font-mono text-[11px]"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t("dtsiPlaceholder")}
      />
      {result && (
        <div className="space-y-1 text-xs">
          <div>
            {t("layers")}: {result.profile.layers.length} / {t("keys")}:{" "}
            {result.profile.keyCount}
          </div>
          <ul className="list-disc pl-4">
            {result.profile.layers.map((layer) => (
              <li key={layer.name}>
                {layer.name}（{layer.bindings.length}）
              </li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[var(--color-warning,#d97706)]">
                {t("warnings")}: {result.warnings.length}
              </summary>
              <ul className="list-disc pl-4">
                {result.warnings.slice(0, 20).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {savedName && (
            <div>
              {t("saved")}: {savedName}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. バッテリー残量予測                                               */
/* ------------------------------------------------------------------ */

function BatteryForecastPanel() {
  const t = useLabText();
  const deviceKeys = useMemo(() => listBatteryDeviceKeys(), []);
  const [deviceKey, setDeviceKey] = useState(deviceKeys[0] ?? "");

  const points: BatteryPoint[] = useMemo(() => {
    if (!deviceKey) return [];
    const bySource = loadBatteryHistory(localStorage, deviceKey);
    return Object.values(bySource)
      .flat()
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [deviceKey]);

  const forecast = useMemo(() => forecastBattery(points), [points]);
  const daily = useMemo(
    () => summarizeDailyDrain(points).slice(-7).reverse(),
    [points],
  );

  return (
    <section className={CARD}>
      <h2 className={HEADING}>{t("batteryTitle")}</h2>
      {deviceKeys.length === 0 ? (
        <p className={MUTED}>{t("batteryEmpty")}</p>
      ) : (
        <>
          <select
            className={INPUT}
            value={deviceKey}
            onChange={(event) => setDeviceKey(event.target.value)}
          >
            {deviceKeys.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <div className={MUTED}>{t("currentLevel")}</div>
              <div>
                {forecast.currentLevel === null
                  ? "—"
                  : `${Math.round(forecast.currentLevel)}%`}
              </div>
            </div>
            <div>
              <div className={MUTED}>{t("drainRate")}</div>
              <div>
                {forecast.ratePerHour === null
                  ? "—"
                  : `${forecast.ratePerHour.toFixed(2)} %/h`}
              </div>
            </div>
            <div>
              <div className={MUTED}>{t("untilThreshold")}</div>
              <div>{formatHours(forecast.hoursToThreshold)}</div>
            </div>
            <div>
              <div className={MUTED}>{t("untilEmpty")}</div>
              <div>{formatHours(forecast.hoursToEmpty)}</div>
            </div>
          </div>
          <p className={MUTED}>
            {t("basis")}: {t("sampleHours")} {forecast.sampleHours.toFixed(1)} /{" "}
            {t("samplePoints")} {forecast.samplePoints} / {t("fit")}{" "}
            {forecast.rSquared === null ? "—" : forecast.rSquared.toFixed(2)}
            （{forecast.reason}）
          </p>
          {daily.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className={MUTED}>
                <tr>
                  <th className="py-1">{t("date")}</th>
                  <th>{t("drop")}</th>
                  <th>{t("recordedHours")}</th>
                  <th>%/h</th>
                </tr>
              </thead>
              <tbody>
                {daily.map((day) => (
                  <tr key={day.date}>
                    <td className="py-1">{day.date}</td>
                    <td>{day.drop.toFixed(0)}%</td>
                    <td>{day.hours.toFixed(1)}h</td>
                    <td>{day.ratePerHour.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 3. BLE 再接続計測                                                   */
/* ------------------------------------------------------------------ */

function ReconnectPanel() {
  const t = useLabText();
  const [revision, setRevision] = useState(0);
  const events = useMemo(() => {
    // revision はログ消去後に読み直すためのトリガ。
    void revision;
    return listReconnectEvents(localStorage);
  }, [revision]);
  const summary = useMemo(() => summarizeReconnects(events), [events]);

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between">
        <h2 className={HEADING}>{t("reconnectTitle")}</h2>
        <button
          className={BUTTON}
          onClick={() => {
            clearReconnectEvents(localStorage);
            setRevision((value) => value + 1);
          }}
          disabled={events.length === 0}
        >
          {t("clearLog")}
        </button>
      </div>
      {events.length === 0 ? (
        <p className={MUTED}>{t("reconnectEmpty")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div>
              <div className={MUTED}>{t("median")}</div>
              <div>{formatDurationMs(summary.medianMs)}</div>
            </div>
            <div>
              <div className={MUTED}>{t("p90")}</div>
              <div>{formatDurationMs(summary.p90Ms)}</div>
            </div>
            <div>
              <div className={MUTED}>{t("best")}</div>
              <div>{formatDurationMs(summary.bestMs)}</div>
            </div>
            <div>
              <div className={MUTED}>{t("worst")}</div>
              <div>{formatDurationMs(summary.worstMs)}</div>
            </div>
            <div>
              <div className={MUTED}>{t("successRate")}</div>
              <div>
                {Math.round(summary.successRate * 100)}%（{summary.successes}/
                {summary.attempts}）
              </div>
            </div>
          </div>
          <ul className="space-y-1 text-xs">
            {events.slice(0, 5).map((event) => (
              <li key={event.id} className="flex justify-between gap-2">
                <span>{new Date(event.startedAt).toLocaleString()}</span>
                <span>
                  {event.transport} / {event.outcome}
                </span>
                <span>{formatDurationMs(event.durationMs)}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 4. 配列改善サジェスト                                               */
/* ------------------------------------------------------------------ */

function LayoutSuggestionPanel() {
  const t = useLabText();
  const stats = useMemo(() => loadStats(localStorage), []);
  const keyCount = useMemo(() => {
    const positions = Object.keys(stats.countsByPosition).map(Number);
    const max = positions.length > 0 ? Math.max(...positions) : -1;
    if (max < 0) return 0;
    if (max < 34) return 34;
    return 40;
  }, [stats]);

  const suggestions = useMemo(() => {
    if (keyCount === 0) return [];
    return suggestSwaps({
      counts: stats.countsByPosition,
      efforts: defaultEffortsForKeyCount(keyCount),
      limit: 5,
    });
  }, [stats, keyCount]);

  return (
    <section className={CARD}>
      <h2 className={HEADING}>{t("layoutTitle")}</h2>
      <p className={MUTED}>{t("layoutDesc")}</p>
      {suggestions.length === 0 ? (
        <p className={MUTED}>{t("layoutEmpty")}</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.fromPosition}-${suggestion.toPosition}`}>
              {suggestion.fromLabel}（{suggestion.fromCount} {t("presses")}）⇄{" "}
              {suggestion.toLabel}（{suggestion.toCount} {t("presses")}）{" "}
              {t("estimatedSaving")} {Math.round(suggestion.savingRatio * 100)}%
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 5. 自動スナップショット                                             */
/* ------------------------------------------------------------------ */

function AutoSnapshotPanel() {
  const t = useLabText();
  const [enabled, setEnabled] = useState(() =>
    isAutoSnapshotEnabled(localStorage),
  );
  const snapshots = useMemo(() => listSnapshots(localStorage), []);

  return (
    <section className={CARD}>
      <h2 className={HEADING}>{t("autoSnapshotTitle")}</h2>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setAutoSnapshotEnabled(localStorage, event.target.checked);
          }}
        />
        {t("autoSnapshotToggle")}
      </label>
      <p className={MUTED}>
        {t("autoSnapshotDesc")} {t("snapshotCount")}: {snapshots.length}
      </p>
      {snapshots[0] && (
        <p className={MUTED}>
          {t("latest")}: {snapshots[0].note}（
          {new Date(snapshots[0].savedAt).toLocaleString()}）
        </p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 6. デバイス別プロファイル自動切替                                 */
/* ------------------------------------------------------------------ */

function ProfileBindingPanel() {
  const t = useLabText();
  const { isConnected, deviceName: connectedName } =
    useContext(ConnectionContext);
  const [revision, setRevision] = useState(0);
  const bindings = useMemo(() => {
    void revision;
    return listDeviceProfileBindings(localStorage);
  }, [revision]);
  const profiles = useMemo(() => {
    void revision;
    return listProfiles();
  }, [revision]);
  const [deviceName, setDeviceName] = useState("");
  const [profileName, setProfileName] = useState(profiles[0]?.name ?? "");
  const [autoApply, setAutoApply] = useState(true);

  // 接続中のデバイスに対する判定結果（実適用は Keymap タブに任せる）。
  const resolution = useMemo(() => {
    void revision;
    if (!isConnected || !connectedName) return null;
    return resolveAutoProfile(
      localStorage,
      deviceKeyFor({ name: connectedName }),
      listProfiles(),
    );
  }, [isConnected, connectedName, revision]);

  const add = useCallback(() => {
    if (!deviceName.trim() || !profileName) return;
    setDeviceProfileBinding(localStorage, {
      deviceKey: deviceKeyFor({ name: deviceName }),
      deviceLabel: deviceName,
      profileName,
      autoApply,
    });
    setDeviceName("");
    setRevision((value) => value + 1);
  }, [deviceName, profileName, autoApply]);

  const resolutionText = (): string => {
    if (!resolution) return t("notConnected");
    switch (resolution.status) {
      case "auto-apply":
        return t("statusAutoApply");
      case "suggest":
        return t("statusSuggest");
      case "missing-profile":
        return t("statusMissingProfile");
      default:
        return t("statusNone");
    }
  };

  return (
    <section className={CARD}>
      <h2 className={HEADING}>{t("bindingTitle")}</h2>
      <p className={MUTED}>{t("bindingDesc")}</p>
      <p className={MUTED}>
        {t("connectedDevice")}: {connectedName ?? "—"} / {resolutionText()}
        {resolution?.profile ? `（${resolution.profile.name}）` : ""}
      </p>
      {profiles.length === 0 ? (
        <p className={MUTED}>{t("bindingNoProfiles")}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={INPUT}
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            placeholder={t("deviceNamePlaceholder")}
          />
          <select
            className={INPUT}
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
          >
            {profiles.map((profile) => (
              <option key={profile.name} value={profile.name}>
                {profile.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(event) => setAutoApply(event.target.checked)}
            />
            {t("autoApply")}
          </label>
          <button className={BUTTON} onClick={add} disabled={!deviceName.trim()}>
            {t("bind")}
          </button>
        </div>
      )}
      {bindings.length > 0 && (
        <ul className="space-y-1 text-xs">
          {bindings.map((binding) => (
            <li key={binding.deviceKey} className="flex items-center gap-2">
              <span className="flex-1">
                {binding.deviceLabel ?? binding.deviceKey} →{" "}
                {binding.profileName}（
                {binding.autoApply ? t("autoApply") : t("suggestOnly")}）
              </span>
              <button
                className={BUTTON}
                onClick={() => {
                  removeDeviceProfileBinding(localStorage, binding.deviceKey);
                  setRevision((value) => value + 1);
                }}
              >
                {t("remove")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function StudioLabPage() {
  return (
    <div className="space-y-4 p-4">
      <DtsiImportPanel />
      <BatteryForecastPanel />
      <ReconnectPanel />
      <LayoutSuggestionPanel />
      <AutoSnapshotPanel />
      <ProfileBindingPanel />
    </div>
  );
}

export default StudioLabPage;
