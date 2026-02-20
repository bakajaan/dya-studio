import { useContext, useEffect } from "react";
import {
  IconBrandGithub,
  IconLock,
  IconFile,
  IconGitPullRequest,
} from "@tabler/icons-react";
import { ConnectionContext } from "../components/DeviceConnection";
import { useGitHub } from "../hooks/useGitHub";
import { useKeymap } from "../hooks/useKeymap";
import type { DiffLine } from "../lib/keymapFileGenerator";
import type { GitHubRepo } from "../lib/github";

function DiffViewer({ diff }: { diff: DiffLine[] }) {
  const added = diff.filter((l) => l.type === "added").length;
  const removed = diff.filter((l) => l.type === "removed").length;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2 text-xs">
        <span className="text-green-400">+{added} added</span>
        <span className="text-red-400">-{removed} removed</span>
      </div>
      <div className="rounded-lg overflow-auto max-h-96 border border-[var(--color-border)] bg-[var(--color-surface)] font-mono text-xs">
        {diff.map((line, i) => (
          <div
            key={i}
            className={`flex gap-2 px-3 py-0.5 ${
              line.type === "added"
                ? "bg-green-500/10 text-green-300"
                : line.type === "removed"
                  ? "bg-red-500/10 text-red-300"
                  : "text-[var(--color-text-muted)]"
            }`}
          >
            <span className="w-10 text-right shrink-0 text-[var(--color-text-muted)] select-none">
              {line.lineNumber.old ?? ""}
            </span>
            <span className="w-10 text-right shrink-0 text-[var(--color-text-muted)] select-none">
              {line.lineNumber.new ?? ""}
            </span>
            <span className="w-4 shrink-0 select-none">
              {line.type === "added"
                ? "+"
                : line.type === "removed"
                  ? "-"
                  : " "}
            </span>
            <span className="whitespace-pre">{line.content}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GitHubPage() {
  const connection = useContext(ConnectionContext);
  const isDemo = Boolean(connection.deviceName?.includes("Demo"));
  const gh = useGitHub(isDemo);
  const { keymap, behaviors } = useKeymap();

  useEffect(() => {
    if (keymap && behaviors.size > 0 && gh.originalContent) {
      gh.updateDiff(keymap, behaviors);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keymap, behaviors, gh.originalContent]);

  const handleRepoClick = (repo: GitHubRepo) => {
    gh.selectRepo(repo);
  };

  const handleFileClick = (path: string) => {
    gh.selectFile(path);
  };

  const handleCommit = () => {
    if (!keymap || !behaviors) return;
    gh.commitChanges(keymap, behaviors);
  };

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
            <IconBrandGithub
              size={24}
              className="text-[var(--color-electric)]"
            />
          </div>
          <div>
            <h1 className="text-xl font-medium text-[var(--color-text)]">
              GitHub Keymap Sync
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Sync your keymap configuration to GitHub
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* Demo Mode Banner */}
          {isDemo && (
            <div className="p-4 rounded-lg bg-[var(--color-cyber)]/10 border border-[var(--color-cyber)]/30">
              <p className="text-sm font-medium text-[var(--color-cyber)] mb-1">
                Demo Mode
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                GitHub login is disabled in demo mode. Repository and file
                selection is simulated with sample data.
              </p>
            </div>
          )}

          {/* Error Display */}
          {gh.error && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
              <p className="text-sm text-red-400">{gh.error}</p>
            </div>
          )}

          {/* Auth Section */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">
              Authentication
            </h3>
            {!gh.user ? (
              <div>
                {!isDemo && (
                  <button className="btn-electric text-sm" onClick={gh.login}>
                    Login with GitHub
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={gh.user.avatar_url}
                    alt={gh.user.login}
                    className="w-8 h-8 rounded-full border border-[var(--color-border)]"
                  />
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {gh.user.name ?? gh.user.login}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      @{gh.user.login}
                    </p>
                  </div>
                </div>
                {!isDemo && (
                  <button className="btn-ghost text-sm" onClick={gh.logout}>
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Repository Selector */}
          {gh.repos.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">
                Select Repository
              </h3>
              <div className="space-y-2">
                {gh.repos.map((repo) => (
                  <button
                    key={repo.id}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      gh.selectedRepo?.id === repo.id
                        ? "border-[var(--color-electric)] bg-[var(--color-electric)]/10"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-border)]"
                    }`}
                    onClick={() => handleRepoClick(repo)}
                  >
                    {repo.private && (
                      <IconLock
                        size={14}
                        className="text-[var(--color-text-muted)] shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">
                        {repo.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {repo.full_name}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Loading */}
          {gh.isLoading && (
            <div className="glass-card p-6">
              <p className="text-sm text-[var(--color-text-muted)]">
                Loading...
              </p>
            </div>
          )}

          {/* Keymap File Selector */}
          {gh.selectedRepo && gh.keymapFiles.length > 0 && (
            <div className="glass-card p-6">
              <h3 className="text-sm font-medium text-[var(--color-text)] mb-4">
                Select Keymap File
              </h3>
              <div className="space-y-2">
                {gh.keymapFiles.map((path) => (
                  <button
                    key={path}
                    className={`w-full text-left p-3 rounded-lg border transition-colors flex items-center gap-3 ${
                      gh.selectedFile === path
                        ? "border-[var(--color-electric)] bg-[var(--color-electric)]/10"
                        : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] hover:bg-[var(--color-border)]"
                    }`}
                    onClick={() => handleFileClick(path)}
                  >
                    <IconFile
                      size={14}
                      className="text-[var(--color-text-muted)] shrink-0"
                    />
                    <span className="text-sm font-mono text-[var(--color-text-secondary)] truncate">
                      {path}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Diff Section */}
          {gh.selectedFile && gh.originalContent && (
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-[var(--color-text)]">
                  Keymap Changes
                </h3>
                <div className="flex items-center gap-2">
                  {gh.diff.length > 0 && (
                    <button
                      className="btn-electric text-sm flex items-center gap-2"
                      onClick={handleCommit}
                    >
                      <IconGitPullRequest size={16} />
                      {isDemo ? "Demo: Would Create PR" : "Create Pull Request"}
                    </button>
                  )}
                </div>
              </div>

              {gh.diff.length > 0 ? (
                <DiffViewer diff={gh.diff} />
              ) : (
                <p className="text-sm text-[var(--color-text-muted)]">
                  No changes detected. Connect keyboard and load keymap to see
                  differences.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 p-4 rounded-lg bg-[var(--color-border)] border border-[var(--color-border-hover)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            GitHub Keymap Sync allows you to export your current keyboard
            configuration as a pull request to your ZMK config repository.
            Connect your keyboard, select a repository and keymap file, then
            create a PR with the updated bindings.
          </p>
        </div>
      </div>
    </div>
  );
}
