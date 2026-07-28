/**
 * Lab タブ専用の文言。
 *
 * 本体の translations.ts は 70KB 超の巨大な辞書なので、実験的な画面の
 * 文言を混ぜると差分が見づらくなる。Lab タブだけの小さな辞書を分けて
 * 持ち、機能が定着したものから本体の辞書に引っ越す。
 */
import type { Language } from "./translations";

export const labStrings = {
  labTab: { ja: "Lab", en: "Lab" },

  dtsiTitle: { ja: "dtsi インポート", en: "dtsi import" },
  dtsiDesc: {
    ja: "zmk-keymap-common などの .keymap / .dtsi を読み込んでキーマッププロファイルに変換します。保存後は Keymap タブから実機に適用できます。",
    en: "Convert a .keymap / .dtsi file (e.g. from zmk-keymap-common) into a keymap profile. Apply it to the keyboard from the Keymap tab.",
  },
  profileName: { ja: "プロファイル名", en: "Profile name" },
  parse: { ja: "解析", en: "Parse" },
  saveAsProfile: { ja: "プロファイルとして保存", en: "Save as profile" },
  dtsiPlaceholder: {
    ja: "ここに dtsi を貼り付けることもできます",
    en: "You can also paste dtsi here",
  },
  layers: { ja: "レイヤー数", en: "Layers" },
  keys: { ja: "キー数", en: "Keys" },
  warnings: { ja: "警告", en: "Warnings" },
  saved: { ja: "保存しました", en: "Saved" },

  batteryTitle: { ja: "バッテリー残量予測", en: "Battery forecast" },
  batteryEmpty: {
    ja: "まだバッテリー履歴がありません。接続してしばらく使うと蓄積されます。",
    en: "No battery history yet. It builds up while the keyboard is connected.",
  },
  currentLevel: { ja: "現在の残量", en: "Current level" },
  drainRate: { ja: "消費ペース", en: "Drain rate" },
  untilThreshold: { ja: "10% まで", en: "Until 10%" },
  untilEmpty: { ja: "0% まで", en: "Until empty" },
  basis: { ja: "根拠", en: "Based on" },
  sampleHours: { ja: "直近の放電区間（時間）", en: "latest discharge span (h)" },
  samplePoints: { ja: "サンプル数", en: "samples" },
  fit: { ja: "当てはまり度 R²", en: "fit R²" },
  date: { ja: "日付", en: "Date" },
  drop: { ja: "減少", en: "Drop" },
  recordedHours: { ja: "記録時間", en: "Recorded" },

  reconnectTitle: { ja: "BLE 再接続時間", en: "BLE reconnect time" },
  clearLog: { ja: "ログを消去", en: "Clear log" },
  reconnectEmpty: {
    ja: "まだ記録がありません。接続のたびに自動で記録されます。",
    en: "No measurements yet. Each connection attempt is recorded automatically.",
  },
  median: { ja: "中央値", en: "Median" },
  p90: { ja: "p90", en: "p90" },
  best: { ja: "最短", en: "Best" },
  worst: { ja: "最長", en: "Worst" },
  successRate: { ja: "成功率", en: "Success rate" },

  layoutTitle: { ja: "配列改善サジェスト", en: "Layout suggestions" },
  layoutDesc: {
    ja: "打鍵回数と「押しやすさ」の組み合わせから、入れ替えると楽になるキーを提案します（自動では変更しません）。",
    en: "Suggests key swaps that lower total effort, based on press counts and per-position effort. Nothing is changed automatically.",
  },
  layoutEmpty: {
    ja: "現状で提案はありません。打鍵統計が蓄積されると表示されます。",
    en: "No suggestions yet. They appear once key usage statistics build up.",
  },
  presses: { ja: "回", en: "presses" },
  estimatedSaving: { ja: "推定削減", en: "Est. saving" },

  autoSnapshotTitle: { ja: "自動スナップショット", en: "Automatic snapshots" },
  autoSnapshotToggle: {
    ja: "キーマップを保存するときに自動でスナップショットを残す",
    en: "Take a snapshot automatically when the keymap is saved",
  },
  autoSnapshotDesc: {
    ja: "同じ内容の連発や 1 分以内の連打保存では作らないので、履歴が埋まりません。",
    en: "Identical keymaps and saves within one minute are skipped, so the history does not fill up.",
  },
  snapshotCount: { ja: "保存済み件数", en: "Stored snapshots" },
  latest: { ja: "最新", en: "Latest" },

  bindingTitle: { ja: "デバイス別プロファイル", en: "Per-device profiles" },
  bindingDesc: {
    ja: "デバイス名とキーマッププロファイルを紐づけておくと、次回接続時に自動適用（または提案）されます。",
    en: "Link a device name to a keymap profile and it is applied (or suggested) on the next connection.",
  },
  bindingNoProfiles: {
    ja: "先にキーマッププロファイルを保存してください。",
    en: "Save a keymap profile first.",
  },
  deviceNamePlaceholder: {
    ja: "デバイス名（例: jisaku_1）",
    en: "Device name (e.g. jisaku_1)",
  },
  autoApply: { ja: "自動適用", en: "Auto apply" },
  suggestOnly: { ja: "提案のみ", en: "Suggest only" },
  bind: { ja: "紐づける", en: "Link" },
  remove: { ja: "削除", en: "Remove" },
  connectedDevice: { ja: "接続中のデバイス", en: "Connected device" },
  statusAutoApply: {
    ja: "紐づいたプロファイルがあります（自動適用設定）。Keymap タブで適用できます。",
    en: "A linked profile is set to auto apply. Apply it from the Keymap tab.",
  },
  statusSuggest: {
    ja: "紐づいたプロファイルがあります（提案のみ）。",
    en: "A linked profile is available (suggestion only).",
  },
  statusMissingProfile: {
    ja: "紐づけられたプロファイルが見つかりません。削除された可能性があります。",
    en: "The linked profile is missing. It may have been deleted.",
  },
  statusNone: {
    ja: "このデバイスに紐づいたプロファイルはありません。",
    en: "No profile is linked to this device.",
  },
  notConnected: { ja: "未接続", en: "Not connected" },
} as const;

export type LabKey = keyof typeof labStrings;

export function labText(language: Language, key: LabKey): string {
  const entry = labStrings[key];
  return language === "ja" ? entry.ja : entry.en;
}
