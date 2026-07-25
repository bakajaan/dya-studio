/**
 * KeymapProfilePanel — save the current keymap as a named profile, export or
 * import profiles as JSON files, and apply a profile to the connected
 * keyboard. Profiles are device-independent (behavior display names instead
 * of device-local ids) and key positions are converted automatically between
 * the 40-key and 34-key layouts (see src/lib/keymapProfile.ts).
 *
 * Applying a profile only makes in-memory edits: the user reviews the result
 * on the keymap and presses Save to persist it to the keyboard's flash.
 */
import { useCallback, useContext, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  IconAlertTriangle,
  IconArrowsExchange,
  IconDeviceFloppy,
  IconDownload,
  IconLoader2,
  IconTrash,
  IconUpload,
} from "@tabler/icons-react";
import { ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import type { UseKeymapReturn } from "../hooks/useKeymap";
import { useLanguage } from "../hooks/useLanguage";
import {
  buildApplyPlan,
  listProfiles,
  parseProfileJson,
  removeProfile,
  serializeKeymap,
  upsertProfile,
  type KeymapProfile,
} from "../lib/keymapProfile";

interface KeymapProfilePanelProps {
  keymap: UseKeymapReturn;
}

export function KeymapProfilePanel({ keymap }: KeymapProfilePanelProps) {
  const { language } = useLanguage();
  // Local bilingual label helper: this panel keeps its strings self-contained
  // instead of adding keys to the global translations table.
  const L = useCallback(
    (en: string, ja: string) => (language === "ja" ? ja : en),
    [language],
  );
  const zmkApp = useContext(ZMKAppContext);
  const deviceName = zmkApp?.state.deviceInfo?.name;

  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<KeymapProfile[]>([]);
  const [newName, setNewName] = useState("");
  const [busyProfile, setBusyProfile] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && busyProfile !== null) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setProfiles(listProfiles());
      setMessage(null);
      setErrorMessage(null);
      setNewName(deviceName ? `${deviceName} keymap` : "");
    }
  };

  const handleSaveProfile = () => {
    if (!keymap.keymap) return;
    const name = newName.trim();
    if (!name) return;
    const profile = serializeKeymap(
      keymap.keymap,
      keymap.behaviors,
      name,
      deviceName,
    );
    setProfiles(upsertProfile(profile));
    setMessage(L("Profile saved.", "プロファイルを保存しました。"));
    setErrorMessage(null);
  };

  const handleExport = (profile: KeymapProfile) => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${profile.name.replace(/[^\w.-]+/g, "_")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const profile = parseProfileJson(text);
    if (!profile) {
      setErrorMessage(
        L(
          "Invalid profile file.",
          "プロファイルファイルの形式が正しくありません。",
        ),
      );
      return;
    }
    setProfiles(upsertProfile(profile));
    setErrorMessage(null);
    setMessage(L("Profile imported.", "プロファイルを読み込みました。"));
  };

  const handleDelete = (name: string) => {
    setProfiles(removeProfile(name));
  };

  const handleApply = async (profile: KeymapProfile) => {
    if (!keymap.keymap) return;
    const plan = buildApplyPlan(profile, keymap.keymap, keymap.behaviors);

    const skippedNote =
      plan.skippedBehaviors.length > 0
        ? L(
            ` Not on this keyboard: ${plan.skippedBehaviors.join(", ")}.`,
            ` このキーボードに無い動作のためスキップ: ${plan.skippedBehaviors.join(", ")}。`,
          )
        : "";

    if (plan.entries.length === 0) {
      setMessage(
        L(
          "This keyboard already matches the profile (no changes needed).",
          "このキーボードは既にプロファイルと一致しています（変更なし）。",
        ) + skippedNote,
      );
      setErrorMessage(null);
      return;
    }

    setBusyProfile(profile.name);
    setProgress({ current: 0, total: plan.entries.length });
    setMessage(null);
    setErrorMessage(null);
    let applied = 0;
    let failed = 0;
    try {
      for (const entry of plan.entries) {
        const ok = await keymap.setBinding(
          entry.layerId,
          entry.keyPosition,
          entry.binding,
        );
        if (ok) {
          applied += 1;
        } else {
          failed += 1;
        }
        setProgress({ current: applied + failed, total: plan.entries.length });
        // Repeated failures usually mean the device is locked or disconnected;
        // stop early instead of surfacing dozens of identical errors.
        if (!ok && failed >= 3) break;
      }
    } finally {
      setBusyProfile(null);
      setProgress(null);
    }

    const parts: string[] = [
      L(`Applied ${applied} key(s).`, `${applied}キーに適用しました。`),
    ];
    if (failed > 0) {
      parts.push(
        L(`${failed} key(s) failed.`, `${failed}キーは失敗しました。`),
      );
    }
    if (skippedNote) parts.push(skippedNote.trim());
    if (plan.layerCountMismatch) {
      parts.push(
        L(
          "Layer counts differ; extra layers were left unchanged.",
          "レイヤー数が異なるため、余剰レイヤーは変更していません。",
        ),
      );
    }
    if (applied > 0) {
      parts.push(
        L(
          "Review the keymap and press Save to write it to the keyboard.",
          "内容を確認して「保存」を押すとキーボードに書き込まれます。",
        ),
      );
    }
    if (failed > 0) {
      setErrorMessage(parts.join(" "));
      setMessage(null);
    } else {
      setMessage(parts.join(" "));
      setErrorMessage(null);
    }
  };

  return (
    <>
      <button
        className="btn-ghost text-sm flex items-center gap-1.5 flex-shrink-0"
        onClick={() => handleOpenChange(true)}
        disabled={!keymap.keymap || keymap.isLoading}
        title={L(
          "Save, export, and apply keymap profiles",
          "キーマッププロファイルの保存・書き出し・適用",
        )}
      >
        <IconArrowsExchange size={16} />
        {L("Profiles", "プロファイル")}
      </button>

      <Dialog.Root open={open} onOpenChange={handleOpenChange}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-lg max-h-[85vh] overflow-y-auto bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] shadow-2xl z-50 p-6">
            <Dialog.Title className="text-base font-medium text-[var(--color-text)] mb-1">
              {L("Keymap Profiles", "キーマッププロファイル")}
            </Dialog.Title>
            <Dialog.Description className="text-xs text-[var(--color-text-muted)] mb-4">
              {L(
                "Save the current keymap as a profile, then apply it to another keyboard. Key positions are converted automatically between the 40-key and 34-key layouts. Applied changes stay unsaved until you press Save.",
                "現在のキーマップをプロファイルとして保存し、別のキーボードに適用できます。40キーと34キーのレイアウト間ではキー位置を自動変換します。適用した変更は「保存」を押すまで書き込まれません。",
              )}
            </Dialog.Description>

            {/* Save the current keymap as a new profile */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={L("Profile name", "プロファイル名")}
                className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-[var(--color-surface-elevated)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-electric)]"
              />
              <button
                className="btn-electric text-sm flex items-center gap-1.5 flex-shrink-0"
                onClick={handleSaveProfile}
                disabled={
                  !keymap.keymap || !newName.trim() || busyProfile !== null
                }
              >
                <IconDeviceFloppy size={16} />
                {L("Save current", "現在の内容を保存")}
              </button>
            </div>

            {/* Import a profile from a JSON file */}
            <div className="mb-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleImportFile(file);
                  e.target.value = "";
                }}
              />
              <button
                className="btn-ghost text-sm flex items-center gap-1.5"
                onClick={() => fileInputRef.current?.click()}
                disabled={busyProfile !== null}
              >
                <IconUpload size={16} />
                {L("Import JSON file", "JSONファイルを読み込む")}
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 mb-4 rounded-lg border border-red-500/20 bg-red-500/10 flex items-start gap-2">
                <IconAlertTriangle
                  size={16}
                  className="text-red-400 flex-shrink-0 mt-0.5"
                />
                <p className="text-xs text-red-400">{errorMessage}</p>
              </div>
            )}
            {message && (
              <div className="p-3 mb-4 rounded-lg border border-[var(--color-electric)]/20 bg-[var(--color-electric)]/10">
                <p className="text-xs text-[var(--color-electric)]">
                  {message}
                </p>
              </div>
            )}

            {/* Saved profiles */}
            {profiles.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                {L(
                  "No saved profiles yet.",
                  "保存済みのプロファイルはまだありません。",
                )}
              </p>
            ) : (
              <div className="space-y-2">
                {profiles.map((profile) => (
                  <div
                    key={profile.name}
                    className="flex items-center gap-2 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-elevated)]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-[var(--color-text)] truncate">
                        {profile.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] truncate">
                        {L(
                          `${profile.keyCount} keys · ${profile.layers.length} layers`,
                          `${profile.keyCount}キー · ${profile.layers.length}レイヤー`,
                        )}
                        {profile.deviceName ? ` · ${profile.deviceName}` : ""}
                      </p>
                    </div>
                    <button
                      className="btn-electric text-xs flex items-center gap-1 flex-shrink-0"
                      onClick={() => void handleApply(profile)}
                      disabled={busyProfile !== null || !keymap.keymap}
                    >
                      {busyProfile === profile.name ? (
                        <IconLoader2 size={14} className="animate-spin" />
                      ) : (
                        <IconArrowsExchange size={14} />
                      )}
                      {busyProfile === profile.name && progress
                        ? `${progress.current}/${progress.total}`
                        : L("Apply", "適用")}
                    </button>
                    <button
                      className="p-2 rounded-lg hover:bg-[var(--color-border)]"
                      onClick={() => handleExport(profile)}
                      aria-label={L("Export as JSON", "JSONとして書き出し")}
                      title={L("Export as JSON", "JSONとして書き出し")}
                    >
                      <IconDownload
                        size={14}
                        className="text-[var(--color-text-muted)]"
                      />
                    </button>
                    <button
                      className="p-2 rounded-lg hover:bg-[var(--color-border)]"
                      onClick={() => handleDelete(profile.name)}
                      disabled={busyProfile !== null}
                      aria-label={L("Delete profile", "プロファイルを削除")}
                      title={L("Delete profile", "プロファイルを削除")}
                    >
                      <IconTrash size={14} className="text-red-400" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
