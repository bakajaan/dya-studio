import { IconTerminal2 } from "@tabler/icons-react";
import { useAppState } from "../contexts/AppStateContextDef";

export function DebugConsolePage() {
  const appState = useAppState();

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
            <IconTerminal2 size={24} className="text-[var(--color-electric)]" />
          </div>
          <div>
            <h1 className="text-xl font-medium text-[var(--color-text)]">
              Debug Console
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Connect to serial port for debugging and monitoring
            </p>
          </div>
        </div>

        {/* Console - render from app state */}
        <div className="flex-1 glass-card overflow-hidden">
          <div className="flex flex-col h-full bg-[var(--color-bg)]">
            {/* Show console messages/UI using the shared serial console instance */}
            {appState.serialConsole.isConnected ? (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="flex items-center gap-2">
                    <IconTerminal2 size={20} className="text-[var(--color-electric)]" />
                    <span className="text-sm font-medium text-[var(--color-text)]">
                      Serial Console
                    </span>
                    <span className="status-indicator connected" aria-label="Connected" />
                  </div>
                  <button
                    onClick={appState.onSerialDisconnect}
                    className="btn-ghost text-xs"
                  >
                    Disconnect
                  </button>
                </div>
                
                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
                  {appState.serialConsole.messages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`mb-1 ${
                        msg.type === "sent"
                          ? "text-[var(--color-neon)]"
                          : "text-[var(--color-text-secondary)]"
                      }`}
                    >
                      <span className="text-[var(--color-text-muted)] mr-2">
                        {msg.timestamp.toLocaleTimeString()}
                      </span>
                      <span className="mr-2">
                        {msg.type === "sent" ? "→" : "←"}
                      </span>
                      <span>{msg.text}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
                <div className="text-center">
                  <IconTerminal2
                    size={48}
                    className="mx-auto mb-4 opacity-20"
                    strokeWidth={1}
                  />
                  <p>Console disconnected</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 rounded-lg bg-[var(--color-border)] border border-[var(--color-border-hover)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong>Tip:</strong> The serial console connection is shared across the app.
            When you switch to another tab, the console will move to a draggable window.
          </p>
        </div>
      </div>
    </div>
  );
}
