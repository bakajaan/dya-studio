import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import {
  createAbyssClient,
  type AbyssKeymapSummary,
  type AbyssUserInfo,
} from "@keyboard-hub/abyss-client";
import {
  compareKeyboardHubKeymaps,
  isEmptyKeyboardHubKeymapDiff,
  isFirmwareLockedError,
  type FirmwareKeyboardHubKeymap,
  type KeyboardHubKeymapDiff,
} from "@keyboard-hub/adapter-common";
import {
  zmkAdapter,
  type ZmkConnection,
  type ZmkLoadedConnection,
} from "@keyboard-hub/adapter-zmk";
import {
  IconAlertCircle,
  IconCloudDownload,
  IconCloudUpload,
  IconGitCompare,
  IconLoader2,
  IconLock,
  IconLogin,
  IconLogout,
  IconRefresh,
} from "@tabler/icons-react";
import { ConnectionContext } from "../components/DeviceConnection";

const abyssClientId = import.meta.env.VITE_ABYSS_CLIENT_ID ?? "";
const abyssBaseUrl =
  import.meta.env.VITE_ABYSS_BASE_URL ??
  "https://keyboard-abyss.cormoran707.workers.dev";
const abyssStorageKey = "dya-studio:keyboard-abyss:token";
const abyssTransactionStorageKey = "dya-studio:keyboard-abyss:oauth";

type LoadedKeyboard = {
  connection: ZmkLoadedConnection;
  keymap: FirmwareKeyboardHubKeymap;
  deviceName: string;
};

function cleanRedirectUri() {
  const url = new URL(window.location.href);
  url.search = "";
  url.hash = "";
  return url.toString();
}

function displayError(caught: unknown) {
  if (caught instanceof Error) return caught.message;
  return "Unknown error";
}

function keymapData(keymap: AbyssKeymapSummary) {
  return keymap.latestVersion?.data ?? keymap.data ?? null;
}

function bindingLabel(binding: unknown) {
  if (!binding) return "-";
  if (typeof binding === "object") {
    const value = binding as { label?: unknown; zmk?: unknown; type?: unknown };
    if (typeof value.label === "string") return value.label;
    if (typeof value.zmk === "string") return value.zmk;
    if (typeof value.type === "string") return value.type;
  }
  return JSON.stringify(binding);
}

function countDiff(diff: KeyboardHubKeymapDiff | null) {
  if (!diff) return 0;
  return (
    diff.bindingChanges.length +
    diff.layerNameChanges.length +
    diff.comboChanges.length +
    diff.macroChanges.length +
    diff.moduleChanges.length
  );
}

function keymapMatchesKeyboard(
  keymap: AbyssKeymapSummary,
  current: FirmwareKeyboardHubKeymap | null,
) {
  if (!current) return true;
  const candidates = new Set(
    [
      keymap.keyboardSlug,
      keymap.keyboard?.slug,
      keymapData(keymap)?.keyboard,
      keymap.keyboardName,
      keymap.keyboard?.name,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase()),
  );
  return candidates.has(current.keyboard.toLowerCase());
}

function DiffSummary({ diff }: { diff: KeyboardHubKeymapDiff }) {
  const sections = [
    {
      label: "Bindings",
      count: diff.bindingChanges.length,
      rows: diff.bindingChanges.slice(0, 24).map((change) => ({
        key: `binding-${change.layerIndex}-${change.keyIndex}`,
        title: `${change.layerName} / Key ${change.keyIndex + 1}`,
        from: bindingLabel(change.from),
        to: bindingLabel(change.to),
      })),
    },
    {
      label: "Layer names",
      count: diff.layerNameChanges.length,
      rows: diff.layerNameChanges.map((change) => ({
        key: `layer-${change.layerIndex}`,
        title: `Layer ${change.layerIndex + 1}`,
        from: change.from ?? "-",
        to: change.to,
      })),
    },
    {
      label: "Modules",
      count: diff.moduleChanges.length,
      rows: diff.moduleChanges.slice(0, 12).map((change) => ({
        key: `module-${change.scope}-${change.layerIndex ?? "global"}-${change.moduleName}`,
        title:
          change.scope === "layer"
            ? `Layer ${(change.layerIndex ?? 0) + 1} / ${change.moduleName}`
            : `Global / ${change.moduleName}`,
        from: change.from ? "Configured" : "-",
        to: change.to ? "Configured" : "-",
      })),
    },
    {
      label: "Combos",
      count: diff.comboChanges.length,
      rows: diff.comboChanges.slice(0, 8).map((change) => ({
        key: `combo-${change.index}`,
        title: change.label,
        from: change.from ? "Configured" : "-",
        to: change.to ? "Configured" : "-",
      })),
    },
    {
      label: "Macros",
      count: diff.macroChanges.length,
      rows: diff.macroChanges.slice(0, 8).map((change) => ({
        key: `macro-${change.index}`,
        title: change.label,
        from: change.from ? "Configured" : "-",
        to: change.to ? "Configured" : "-",
      })),
    },
  ].filter((section) => section.count > 0);

  if (!sections.length) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
        Selected keymap already matches the connected keyboard.
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {sections.map((section) => (
        <section
          key={section.label}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-[var(--color-text)]">
              {section.label}
            </h3>
            <span className="rounded border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
              {section.count}
            </span>
          </div>
          <div className="grid gap-2">
            {section.rows.map((row) => (
              <div
                key={row.key}
                className="grid gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]"
              >
                <div className="font-medium text-[var(--color-text)]">
                  {row.title}
                </div>
                <div className="min-w-0 text-[var(--color-text-muted)]">
                  <span className="mr-1 text-[var(--color-text-secondary)]">
                    From:
                  </span>
                  <span className="break-words">{row.from}</span>
                </div>
                <div className="min-w-0 text-[var(--color-neon)]">
                  <span className="mr-1 text-[var(--color-text-secondary)]">
                    To:
                  </span>
                  <span className="break-words">{row.to}</span>
                </div>
              </div>
            ))}
            {section.count > section.rows.length && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {section.count - section.rows.length} more changes
              </p>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export function ImportExportPage() {
  const appConnection = useContext(ConnectionContext);
  const zmkApp = useContext(ZMKAppContext);
  const [profile, setProfile] = useState<AbyssUserInfo | null>(null);
  const [keymaps, setKeymaps] = useState<AbyssKeymapSummary[]>([]);
  const [selectedKeymapId, setSelectedKeymapId] = useState("");
  const [loadedKeyboard, setLoadedKeyboard] = useState<LoadedKeyboard | null>(
    null,
  );
  const [diff, setDiff] = useState<KeyboardHubKeymapDiff | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isWriting, setIsWriting] = useState(false);
  const [unlockRequired, setUnlockRequired] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const abyss = useMemo(() => {
    if (!abyssClientId || typeof window === "undefined") return null;
    return createAbyssClient({
      clientId: abyssClientId,
      redirectUri: cleanRedirectUri(),
      scopes: ["profile:read", "keymap:read"],
      abyssBaseUrl,
      storage: window.sessionStorage,
      transactionStorage: window.sessionStorage,
      storageKey: abyssStorageKey,
      transactionStorageKey: abyssTransactionStorageKey,
    });
  }, []);

  const tokenSet = abyss?.getTokenSet() ?? null;
  const selectedKeymap = useMemo(
    () => keymaps.find((keymap) => keymap.id === selectedKeymapId) ?? null,
    [keymaps, selectedKeymapId],
  );
  const matchingKeymaps = useMemo(() => {
    const matches = keymaps.filter((keymap) =>
      keymapMatchesKeyboard(keymap, loadedKeyboard?.keymap ?? null),
    );
    return matches.length ? matches : keymaps;
  }, [keymaps, loadedKeyboard?.keymap]);

  const loadKeyboard = useCallback(async (): Promise<LoadedKeyboard | null> => {
    if (!zmkApp?.state.connection) {
      setLoadedKeyboard(null);
      return null;
    }

    const zmkConnection = {
      method: "zmk",
      transport: "usb",
      deviceName: appConnection.deviceName,
      rpcConnection: zmkApp.state.connection,
    } as unknown as ZmkConnection;

    try {
      const connection = await zmkAdapter.load(zmkConnection);
      const loaded = {
        connection,
        keymap: connection.state.currentKeymap,
        deviceName:
          connection.deviceName ??
          appConnection.deviceName ??
          connection.state.preview.deviceName ??
          "Connected keyboard",
      };
      setLoadedKeyboard(loaded);
      setUnlockRequired(false);
      return loaded;
    } catch (caught) {
      if (isFirmwareLockedError(caught)) {
        setUnlockRequired(true);
        setStatus("Unlock the keyboard in Studio, then retry.");
        return null;
      }
      throw caught;
    }
  }, [appConnection.deviceName, zmkApp?.state.connection]);

  const loadAbyssData = useCallback(
    async (keyboard: LoadedKeyboard | null) => {
      if (!abyss?.getTokenSet()) return;
      const [user, maps] = await Promise.all([
        abyss.userinfo(),
        abyss.listMyKeymaps({ visibility: "all" }),
      ]);
      setProfile(user);
      setKeymaps(maps);
      const nextSelected =
        maps.find((keymap) =>
          keymapMatchesKeyboard(keymap, keyboard?.keymap ?? null),
        )?.id ??
        maps[0]?.id ??
        "";
      setSelectedKeymapId((current) =>
        current && maps.some((keymap) => keymap.id === current)
          ? current
          : nextSelected,
      );
    },
    [abyss],
  );

  const refresh = useCallback(async () => {
    if (!abyss?.getTokenSet()) return;
    setIsLoadingData(true);
    setError(null);
    setStatus("Loading connected keyboard and Abyss keymaps...");
    try {
      const keyboard = await loadKeyboard();
      await loadAbyssData(keyboard);
      setStatus("Loaded Abyss keymaps.");
    } catch (caught) {
      setError(displayError(caught));
      setStatus(null);
    } finally {
      setIsLoadingData(false);
    }
  }, [abyss, loadAbyssData, loadKeyboard]);

  useEffect(() => {
    if (!abyss) return;
    if (!abyss.hasAuthorizationCode()) return;
    let cancelled = false;
    setIsLoadingAuth(true);
    setError(null);
    abyss
      .handleRedirectCallback()
      .then(async () => {
        if (cancelled) return;
        const cleanUrl = new URL(window.location.href);
        cleanUrl.search = "?tab=import-export";
        window.history.replaceState({}, "", cleanUrl);
        setStatus("Connected to Keyboard Abyss.");
        await refresh();
      })
      .catch((caught) => {
        if (!cancelled) setError(displayError(caught));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingAuth(false);
      });
    return () => {
      cancelled = true;
    };
  }, [abyss, refresh]);

  useEffect(() => {
    if (!tokenSet) return;
    void refresh();
  }, [refresh, tokenSet]);

  useEffect(() => {
    const target = selectedKeymap ? keymapData(selectedKeymap) : null;
    if (!target || !loadedKeyboard) {
      setDiff(null);
      return;
    }
    setDiff(
      compareKeyboardHubKeymaps(
        target as FirmwareKeyboardHubKeymap,
        loadedKeyboard.keymap,
      ),
    );
  }, [loadedKeyboard, selectedKeymap]);

  const login = useCallback(async () => {
    if (!abyss) return;
    setIsLoadingAuth(true);
    setError(null);
    try {
      await abyss.startAuthorization();
    } catch (caught) {
      setError(displayError(caught));
      setIsLoadingAuth(false);
    }
  }, [abyss]);

  const logout = useCallback(() => {
    abyss?.clearTokenSet();
    setProfile(null);
    setKeymaps([]);
    setSelectedKeymapId("");
    setLoadedKeyboard(null);
    setDiff(null);
    setStatus("Disconnected from Keyboard Abyss.");
  }, [abyss]);

  const writeDiff = useCallback(async () => {
    if (!loadedKeyboard || !diff || isEmptyKeyboardHubKeymapDiff(diff)) return;
    if (
      !confirm(`Write ${countDiff(diff)} changes to the connected keyboard?`)
    ) {
      return;
    }
    setIsWriting(true);
    setError(null);
    setStatus("Writing keymap diff...");
    try {
      await zmkAdapter.writeKeymapDiff(loadedKeyboard.connection, diff);
      setStatus("Keymap diff written.");
      await refresh();
    } catch (caught) {
      if (isFirmwareLockedError(caught)) {
        setUnlockRequired(true);
        setStatus("Unlock the keyboard in Studio, then retry.");
      } else {
        setError(displayError(caught));
        setStatus(null);
      }
    } finally {
      setIsWriting(false);
    }
  }, [diff, loadedKeyboard, refresh]);

  const hasToken = Boolean(tokenSet);
  const totalChanges = countDiff(diff);

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex flex-col gap-3 tablet:flex-row tablet:items-center">
          <div className="flex items-center gap-3">
            <div className="rounded-lg border border-[var(--color-electric)]/20 bg-[var(--color-electric)]/10 p-2">
              <IconCloudDownload
                size={24}
                className="text-[var(--color-electric)]"
              />
            </div>
            <div>
              <h1 className="text-xl font-medium text-[var(--color-text)]">
                Import/Export
              </h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                Sync keymaps with Keyboard Abyss
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 tablet:ml-auto">
            {hasToken && (
              <button
                className="btn-ghost flex items-center gap-1.5 text-sm"
                onClick={() => void refresh()}
                disabled={isLoadingData || isLoadingAuth}
              >
                {isLoadingData ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconRefresh size={16} />
                )}
                Refresh
              </button>
            )}
            {hasToken ? (
              <button
                className="btn-ghost flex items-center gap-1.5 text-sm"
                onClick={logout}
                disabled={isLoadingData || isWriting}
              >
                <IconLogout size={16} />
                Logout
              </button>
            ) : (
              <button
                className="btn-electric flex items-center gap-1.5 text-sm"
                onClick={() => void login()}
                disabled={!abyss || isLoadingAuth}
              >
                {isLoadingAuth ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconLogin size={16} />
                )}
                Abyss Login
              </button>
            )}
          </div>
        </div>

        {!abyss && (
          <div className="glass-card mb-4 flex items-center gap-3 border-yellow-500/20 bg-yellow-500/10 p-4">
            <IconAlertCircle size={20} className="text-yellow-500" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              Set VITE_ABYSS_CLIENT_ID to enable Keyboard Abyss login.
            </p>
          </div>
        )}

        {error && (
          <div className="glass-card mb-4 flex items-center gap-3 border-red-500/20 bg-red-500/10 p-4">
            <IconAlertCircle size={20} className="text-red-400" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {unlockRequired && (
          <div className="glass-card mb-4 flex flex-wrap items-center gap-3 border-yellow-500/20 bg-yellow-500/10 p-4">
            <IconLock size={20} className="text-yellow-500" />
            <p className="min-w-0 flex-1 text-sm text-[var(--color-text-secondary)]">
              Keyboard needs Studio unlock before Abyss can read or write the
              keymap.
            </p>
            <button
              className="btn-electric flex items-center gap-1.5 text-sm"
              onClick={() => void refresh()}
              disabled={isLoadingData}
            >
              <IconRefresh size={16} />
              Retry
            </button>
          </div>
        )}

        {status && (
          <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]">
            {status}
          </div>
        )}

        <div className="grid gap-4 tablet:grid-cols-3">
          <div className="data-card">
            <span className="data-card-label">Abyss</span>
            <span className="data-card-value">
              {profile?.username ?? (hasToken ? "Connected" : "Not connected")}
            </span>
          </div>
          <div className="data-card">
            <span className="data-card-label">Keyboard</span>
            <span className="data-card-value">
              {loadedKeyboard?.deviceName ??
                appConnection.deviceName ??
                "Not loaded"}
            </span>
          </div>
          <div className="data-card">
            <span className="data-card-label">Diff</span>
            <span className="data-card-value">{totalChanges}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-5 tablet:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)]">
          <section className="glass-card p-4">
            <div className="mb-3 flex items-center gap-2">
              <IconCloudDownload
                size={18}
                className="text-[var(--color-electric)]"
              />
              <h2 className="text-base font-medium text-[var(--color-text)]">
                Abyss keymaps
              </h2>
            </div>

            {!hasToken ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Login to Keyboard Abyss to load keymaps.
              </p>
            ) : isLoadingData && keymaps.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <IconLoader2 size={16} className="animate-spin" />
                Loading keymaps...
              </div>
            ) : matchingKeymaps.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No Abyss keymaps are available.
              </p>
            ) : (
              <div className="grid gap-2">
                {matchingKeymaps.map((keymap) => (
                  <button
                    key={keymap.id}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selectedKeymapId === keymap.id
                        ? "border-[var(--color-electric)] bg-[var(--color-electric)]/10"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-border-hover)]"
                    }`}
                    onClick={() => setSelectedKeymapId(keymap.id)}
                  >
                    <span className="block text-sm font-medium text-[var(--color-text)]">
                      {keymap.name}
                    </span>
                    <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                      {keymap.keyboard?.name ??
                        keymap.keyboardName ??
                        keymapData(keymap)?.keyboard ??
                        "Keyboard Abyss"}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="glass-card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <IconGitCompare
                size={18}
                className="text-[var(--color-electric)]"
              />
              <h2 className="text-base font-medium text-[var(--color-text)]">
                Diff preview
              </h2>
              <button
                className="btn-electric ml-auto flex items-center gap-1.5 text-sm"
                onClick={() => void writeDiff()}
                disabled={
                  !diff ||
                  isEmptyKeyboardHubKeymapDiff(diff) ||
                  isWriting ||
                  isLoadingData
                }
              >
                {isWriting ? (
                  <IconLoader2 size={16} className="animate-spin" />
                ) : (
                  <IconCloudUpload size={16} />
                )}
                Write
              </button>
            </div>

            {!selectedKeymap ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Select an Abyss keymap to preview changes.
              </p>
            ) : !loadedKeyboard ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                Load the connected keyboard to compare keymaps.
              </p>
            ) : diff ? (
              <DiffSummary diff={diff} />
            ) : (
              <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                <IconLoader2 size={16} className="animate-spin" />
                Preparing diff...
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
