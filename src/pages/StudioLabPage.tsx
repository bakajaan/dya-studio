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
import { useCallback, useMemo, useState, type ChangeEvent } from "react";

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
  const [text, setText] = useState("");
  const [name, setName] = useState("dtsi-import");
  const [result, setResult] = useState<{
    profile: KeymapProfile;
    warnings: string[];
  } | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const handleFile = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setText(content);
    setName(file.name.replace(/\.(keymap|dtsi|overlay)$/, ""));
    setResult(null);
    setSavedName(null);
  }, []);

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
      <h2 className={HEADING}>dtsi インポート</h2>
      <p className={MUTED}>
        zmk-keymap-common などの .keymap / .dtsi を読み込んでキーマップ
        プロファイルに変換します。保存後は Keymap タブから実機に適用できます。
      </p>
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
          placeholder="プロファイル名"
        />
        <button className={BUTTON} onClick={parse} disabled={!text.trim()}>
          解析
        </button>
        <button className={BUTTON} onClick={save} disabled={!result}>
          プロファイルとして保存
        </button>
      </div>
      <textarea
        className="w-full h-32 rounded-md border border-[var(--color-border)] bg-transparent p-2 font-mono text-[11px]"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="ここに dtsi を貼り付けることもできます"
      />
      {result && (
        <div className="space-y-1 text-xs">
          <div>
            レイヤー {result.profile.layers.length} 枚 / キー数{" "}
            {result.profile.keyCount}
          </div>
          <ul className="list-disc pl-4">
            {result.profile.layers.map((layer) => (
              <li key={layer.name}>
                {layer.name}（{layer.bindings.length} キー）
              </li>
            ))}
          </ul>
          {result.warnings.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[var(--color-warning,#d97706)]">
                警告 {result.warnings.length} 件
              </summary>
              <ul className="list-disc pl-4">
                {result.warnings.slice(0, 20).map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </details>
          )}
          {savedName && <div>「{savedName}」を保存しました。</div>}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* 2. バッテリー残量予測                                               */
/* ------------------------------------------------------------------ */

function BatteryForecastPanel() {
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
      <h2 className={HEADING}>バッテリー残量予測</h2>
      {deviceKeys.length === 0 ? (
        <p className={MUTED}>
          まだバッテリー履歴がありません。接続してしばらく使うと蓄積されます。
        </p>
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
              <div className={MUTED}>現在の残量</div>
              <div>
                {forecast.currentLevel === null
                  ? "—"
                  : `${Math.round(forecast.currentLevel)}%`}
              </div>
            </div>
            <div>
              <div className={MUTED}>消費ペース</div>
              <div>
                {forecast.ratePerHour === null
                  ? "—"
                  : `${forecast.ratePerHour.toFixed(2)} %/h`}
              </div>
            </div>
            <div>
              <div className={MUTED}>10% まで</div>
              <div>{formatHours(forecast.hoursToThreshold)}</div>
            </div>
            <div>
              <div className={MUTED}>0% まで</div>
              <div>{formatHours(forecast.hoursToEmpty)}</div>
            </div>
          </div>
          <p className={MUTED}>
            根拠：直近の放電区間 {forecast.sampleHours.toFixed(1)} 時間 /{" "}
            {forecast.samplePoints} 点、当てはまり度 R² ={" "}
            {forecast.rSquared === null ? "—" : forecast.rSquared.toFixed(2)}
            （{forecast.reason}）
          </p>
          {daily.length > 0 && (
            <table className="w-full text-left text-xs">
              <thead className={MUTED}>
                <tr>
                  <th className="py-1">日付</th>
                  <th>減少</th>
                  <th>記録時間</th>
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
  const [revision, setRevision] = useState(0);
  const events = useMemo(() => listReconnectEvents(localStorage), [revision]);
  const summary = useMemo(() => summarizeReconnects(events), [events]);

  return (
    <section className={CARD}>
      <div className="flex items-center justify-between">
        <h2 className={HEADING}>BLE 再接続時間</h2>
        <button
          className={BUTTON}
          onClick={() => {
            clearReconnectEvents(localStorage);
            setRevision((value) => value + 1);
          }}
          disabled={events.length === 0}
        >
          ログを消去
        </button>
      </div>
      {events.length === 0 ? (
        <p className={MUTED}>
          まだ記録がありません。接続のたびに自動で記録されます。
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div>
              <div className={MUTED}>中央値</div>
              <div>{formatDurationMs(summary.medianMs)}</div>
            </div>
            <div>
              <div className={MUTED}>p90</div>
              <div>{formatDurationMs(summary.p90Ms)}</div>
            </div>
            <div>
              <div className={MUTED}>最短</div>
              <div>{formatDurationMs(summary.bestMs)}</div>
            </div>
            <div>
              <div className={MUTED}>最長</div>
              <div>{formatDurationMs(summary.worstMs)}</div>
            </div>
            <div>
              <div className={MUTED}>成功率</div>
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
      <h2 className={HEADING}>配列改善サジェスト</h2>
      <p className={MUTED}>
        打鍵回数と「押しやすさ」の組み合わせから、入れ替えると楽になる
        キーを提案します（自動では変更しません）。
      </p>
      {suggestions.length === 0 ? (
        <p className={MUTED}>
          現状で提案はありません。打鍵統計が蓄積されると表示されます。
        </p>
      ) : (
        <ul className="space-y-1 text-xs">
          {suggestions.map((suggestion) => (
            <li key={`${suggestion.fromPosition}-${suggestion.toPosition}`}>
              {suggestion.fromLabel}（{suggestion.fromCount} 回）⇄{" "}
              {suggestion.toLabel}（{suggestion.toCount} 回） 推定削減{" "}
              {Math.round(suggestion.savingRatio * 100)}%
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
  const [enabled, setEnabled] = useState(() =>
    isAutoSnapshotEnabled(localStorage),
  );
  const snapshots = useMemo(() => listSnapshots(localStorage), []);

  return (
    <section className={CARD}>
      <h2 className={HEADING}>自動スナップショット</h2>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => {
            setEnabled(event.target.checked);
            setAutoSnapshotEnabled(localStorage, event.target.checked);
          }}
        />
        キーマップを保存するときに自動でスナップショットを残す
      </label>
      <p className={MUTED}>
        同じ内容の連発や 1 分以内の連打保存では作らないので、
        履歴が埋まりません。現在 {snapshots.length} 件保存されています。
      </p>
      {snapshots[0] && (
        <p className={MUTED}>
          最新：{snapshots[0].note}（
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
  const [revision, setRevision] = useState(0);
  const bindings = useMemo(
    () => listDeviceProfileBindings(localStorage),
    [revision],
  );
  const profiles = useMemo(() => listProfiles(), [revision]);
  const [deviceName, setDeviceName] = useState("");
  const [profileName, setProfileName] = useState(profiles[0]?.name ?? "");
  const [autoApply, setAutoApply] = useState(true);

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

  return (
    <section className={CARD}>
      <h2 className={HEADING}>デバイス別プロファイル</h2>
      <p className={MUTED}>
        デバイス名とキーマッププロファイルを紐づけておくと、次回接続時に
                自動適用（または提案）されます。
      </p>
      {profiles.length === 0 ? (
        <p className={MUTED}>先にキーマッププロファイルを保存してください。</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={INPUT}
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            placeholder="デバイス名（例: jisaku_1）"
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
            自動適用
          </label>
          <button className={BUTTON} onClick={add} disabled={!deviceName.trim()}>
            紐づける
          </button>
        </div>
      )}
      {bindings.length > 0 && (
        <ul className="space-y-1 text-xs">
          {bindings.map((binding) => (
            <li key={binding.deviceKey} className="flex items-center gap-2">
              <span className="flex-1">
                {binding.deviceLabel ?? binding.deviceKey} →{" "}
                {binding.profileName}
                {binding.autoApply ? "（自動適用）" : "（提案のみ）"}
              </span>
              <button
                className={BUTTON}
                onClick={() => {
                  removeDeviceProfileBinding(localStorage, binding.deviceKey);
                  setRevision((value) => value + 1);
                }}
              >
                削除
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
