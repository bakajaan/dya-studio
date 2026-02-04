import { IconTerminal2 } from "@tabler/icons-react";
import { SerialConsole } from "../components/SerialConsole";
import { useSerialConsoleContext } from "../contexts/SerialConsoleContextDef";
import { useEffect } from "react";

export function DebugConsolePage() {
  const consoleContext = useSerialConsoleContext();

  // When this page is active, show console in tab
  useEffect(() => {
    if (consoleContext.hasActiveConnection && consoleContext.position === "window") {
      consoleContext.showInTab();
    }
  }, [consoleContext]);

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

        {/* Console */}
        <div className="flex-1 glass-card overflow-hidden">
          <SerialConsole
            onConnectionChange={(connected) =>
              consoleContext.setConnectionState(connected)
            }
          />
        </div>

        {/* Info Box */}
        <div className="mt-6 p-4 rounded-lg bg-[var(--color-border)] border border-[var(--color-border-hover)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            <strong>Tip:</strong> The console supports regex-based filtering and
            sed-style word replacement. Click the settings icon to configure
            these features. When you switch to another tab, the console will
            automatically move to a draggable window if you have an active
            connection.
          </p>
        </div>
      </div>
    </div>
  );
}
