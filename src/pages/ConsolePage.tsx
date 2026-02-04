import { useCallback, useRef, useContext, useEffect } from "react";
import { IconTerminal2, IconPlus } from "@tabler/icons-react";
import { SerialConsole } from "../components/SerialConsole";
import { ConsoleContext } from "../contexts/ConsoleContext";

export function ConsolePage() {
  const consoleContext = useContext(ConsoleContext);
  if (!consoleContext) {
    throw new Error("ConsolePage must be used within ConsoleProvider");
  }

  const { consoles, addConsole, removeConsole, updateConsole, snapOut } =
    consoleContext;

  const containerRef = useRef<HTMLDivElement>(null);

  const handleSnapOut = useCallback(
    (id: string) => {
      snapOut(id);

      // Recalculate positions for remaining consoles in the same snap area
      const console = consoles.find((c) => c.id === id);
      if (!console || !console.snapPosition || !containerRef.current) return;

      const snapPos = console.snapPosition;
      const rect = containerRef.current.getBoundingClientRect();
      const remaining = consoles.filter(
        (c) => c.snapPosition === snapPos && c.id !== id,
      );

      if (remaining.length > 0) {
        remaining.forEach((c, index) => {
          if (snapPos === "left" || snapPos === "right") {
            const width = rect.width / 2 / remaining.length;
            const height = rect.height;
            updateConsole(c.id, {
              position: {
                x:
                  snapPos === "left"
                    ? index * width
                    : rect.width / 2 + index * width,
                y: 0,
                width,
                height,
              },
            });
          } else {
            const width = rect.width;
            const height = rect.height / 2 / remaining.length;
            updateConsole(c.id, {
              position: {
                x: 0,
                y:
                  snapPos === "top"
                    ? index * height
                    : rect.height / 2 + index * height,
                width,
                height,
              },
            });
          }
        });
      }
    },
    [snapOut, consoles, updateConsole],
  );

  // Recalculate snap positions on resize
  useEffect(() => {
    const handleResize = () => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();

      // Group consoles by snap position
      const snapGroups: Record<string, typeof consoles> = {
        left: [],
        right: [],
        top: [],
        bottom: [],
      };

      consoles.forEach((console) => {
        if (console.snapPosition) {
          snapGroups[console.snapPosition].push(console);
        }
      });

      // Recalculate positions for each snap group
      Object.entries(snapGroups).forEach(([snapPos, group]) => {
        if (group.length === 0) return;

        group.forEach((c, index) => {
          if (snapPos === "left" || snapPos === "right") {
            const width = rect.width / 2 / group.length;
            const height = rect.height;
            updateConsole(c.id, {
              position: {
                x:
                  snapPos === "left"
                    ? index * width
                    : rect.width / 2 + index * width,
                y: 0,
                width,
                height,
              },
            });
          } else {
            const width = rect.width;
            const height = rect.height / 2 / group.length;
            updateConsole(c.id, {
              position: {
                x: 0,
                y:
                  snapPos === "top"
                    ? index * height
                    : rect.height / 2 + index * height,
                width,
                height,
              },
            });
          }
        });
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [consoles, updateConsole]);

  const snappedConsoles = consoles.filter((c) => c.snapPosition !== null);

  return (
    <div className="p-6 h-full overflow-hidden">
      <div className="max-w-full mx-auto h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
              <IconTerminal2
                size={24}
                className="text-[var(--color-electric)]"
              />
            </div>
            <div>
              <h1 className="text-xl font-medium text-[var(--color-text)]">
                Serial Console
              </h1>
              <p className="text-sm text-[var(--color-text-muted)]">
                Connect and monitor multiple serial devices
              </p>
            </div>
          </div>
          <button
            onClick={addConsole}
            className="btn-electric flex items-center gap-2"
          >
            <IconPlus size={18} />
            New Console
          </button>
        </div>

        {/* Console Container */}
        <div
          ref={containerRef}
          className="flex-1 relative overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]"
        >
          {/* Snapped Consoles */}
          {snappedConsoles.map((console) => (
            <div
              key={console.id}
              className="absolute"
              style={{
                left: `${console.position.x}px`,
                top: `${console.position.y}px`,
                width: `${console.position.width}px`,
                height: `${console.position.height}px`,
                zIndex: console.zIndex,
              }}
            >
              <SerialConsole
                consoleId={console.id}
                onClose={() => removeConsole(console.id)}
                isSnapped={true}
                onSnapOut={() => handleSnapOut(console.id)}
                existingPort={console.port}
              />
            </div>
          ))}

          {/* Empty State */}
          {consoles.length === 0 && (
            <div className="h-full flex items-center justify-center">
              <div className="text-center">
                <IconTerminal2
                  size={48}
                  className="mx-auto mb-4 text-[var(--color-text-muted)] opacity-50"
                />
                <p className="text-[var(--color-text-muted)] mb-4">
                  No console connections
                </p>
                <button onClick={addConsole} className="btn-electric">
                  Create New Console
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-4 p-4 rounded-lg bg-[var(--color-border)] border border-[var(--color-border-hover)]">
          <p className="text-xs text-[var(--color-text-muted)]">
            Drag console windows to the edges to snap them into place. Multiple
            consoles can share the same snap area.
          </p>
        </div>
      </div>
    </div>
  );
}
