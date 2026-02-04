import { useState, useCallback, useRef, useContext, useEffect } from "react";
import { IconTerminal2, IconPlus } from "@tabler/icons-react";
import { SerialConsole } from "../components/SerialConsole";
import { DraggableWindow } from "../components/DraggableWindow";
import { ConsoleContext } from "../contexts/ConsoleContext";
import type { WindowPosition } from "../components/DraggableWindow";

type SnapPosition = "left" | "right" | "top" | "bottom" | null;

export function ConsolePage() {
  const consoleContext = useContext(ConsoleContext);
  if (!consoleContext) {
    throw new Error("ConsolePage must be used within ConsoleProvider");
  }

  const {
    consoles,
    addConsole,
    removeConsole,
    updateConsole,
    bringToFront,
    snapConsole: contextSnapConsole,
    snapOut,
  } = consoleContext;

  const [draggedConsoleId, setDraggedConsoleId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPosition>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updatePosition = useCallback(
    (id: string, position: WindowPosition) => {
      updateConsole(id, { position });
    },
    [updateConsole],
  );

  const snapConsoleToPosition = useCallback(
    (id: string, snapPos: SnapPosition) => {
      if (!snapPos || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const consolesToSnap = consoles.filter(
        (c) => c.snapPosition === snapPos || c.id === id,
      );
      const othersSnapped = consolesToSnap.filter((c) => c.id !== id);
      const totalInSnap = othersSnapped.length + 1;

      let newPosition: WindowPosition;

      if (snapPos === "left" || snapPos === "right") {
        const width = rect.width / 2 / totalInSnap;
        const height = rect.height;
        const index = othersSnapped.length;
        newPosition = {
          x:
            snapPos === "left" ? index * width : rect.width / 2 + index * width,
          y: 0,
          width,
          height,
        };
      } else {
        const width = rect.width;
        const height = rect.height / 2 / totalInSnap;
        const index = othersSnapped.length;
        newPosition = {
          x: 0,
          y:
            snapPos === "top"
              ? index * height
              : rect.height / 2 + index * height,
          width,
          height,
        };
      }

      // Update this console
      updateConsole(id, { position: newPosition, snapPosition: snapPos });
      contextSnapConsole(id, snapPos);

      // Recalculate positions for existing snapped consoles
      othersSnapped.forEach((c, consoleIndex) => {
        if (snapPos === "left" || snapPos === "right") {
          const width = rect.width / 2 / totalInSnap;
          const height = rect.height;
          updateConsole(c.id, {
            position: {
              x:
                snapPos === "left"
                  ? consoleIndex * width
                  : rect.width / 2 + consoleIndex * width,
              y: 0,
              width,
              height,
            },
          });
        } else {
          const width = rect.width;
          const height = rect.height / 2 / totalInSnap;
          updateConsole(c.id, {
            position: {
              x: 0,
              y:
                snapPos === "top"
                  ? consoleIndex * height
                  : rect.height / 2 + consoleIndex * height,
              width,
              height,
            },
          });
        }
      });
    },
    [consoles, updateConsole, contextSnapConsole],
  );

  const handleDragEnd = useCallback(
    (id: string, position: WindowPosition) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const snapThreshold = 50;

      let snapPos: SnapPosition = null;

      // Check if dragged to snap areas
      if (position.x < snapThreshold) {
        snapPos = "left";
      } else if (position.x + position.width > rect.width - snapThreshold) {
        snapPos = "right";
      } else if (position.y < snapThreshold) {
        snapPos = "top";
      } else if (position.y + position.height > rect.height - snapThreshold) {
        snapPos = "bottom";
      }

      if (snapPos) {
        snapConsoleToPosition(id, snapPos);
      }

      setDraggedConsoleId(null);
      setSnapPreview(null);
    },
    [snapConsoleToPosition],
  );

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

  const handleDragStart = useCallback((id: string) => {
    setDraggedConsoleId(id);
  }, []);

  const handlePositionChange = useCallback(
    (id: string, position: WindowPosition) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const snapThreshold = 50;

      let snapPos: SnapPosition = null;

      if (position.x < snapThreshold) {
        snapPos = "left";
      } else if (position.x + position.width > rect.width - snapThreshold) {
        snapPos = "right";
      } else if (position.y < snapThreshold) {
        snapPos = "top";
      } else if (position.y + position.height > rect.height - snapThreshold) {
        snapPos = "bottom";
      }

      setSnapPreview(snapPos);
      updatePosition(id, position);
    },
    [updatePosition],
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
  const floatingConsoles = consoles.filter((c) => c.snapPosition === null);

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
          {/* Snap Preview Overlays */}
          {draggedConsoleId && snapPreview && (
            <div
              className="absolute bg-[var(--color-electric)]/20 border-2 border-[var(--color-electric)] border-dashed pointer-events-none z-[9999]"
              style={
                snapPreview === "left"
                  ? { left: 0, top: 0, width: "50%", height: "100%" }
                  : snapPreview === "right"
                    ? { right: 0, top: 0, width: "50%", height: "100%" }
                    : snapPreview === "top"
                      ? { left: 0, top: 0, width: "100%", height: "50%" }
                      : { left: 0, bottom: 0, width: "100%", height: "50%" }
              }
            />
          )}

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
              />
            </div>
          ))}

          {/* Floating Windows */}
          {floatingConsoles.map((console) => (
            <DraggableWindow
              key={console.id}
              initialPosition={console.position}
              onPositionChange={(pos) => handlePositionChange(console.id, pos)}
              onDragStart={() => handleDragStart(console.id)}
              onDragEnd={(pos) => handleDragEnd(console.id, pos)}
              zIndex={console.zIndex}
              onFocus={() => bringToFront(console.id)}
            >
              <SerialConsole
                consoleId={console.id}
                onClose={() => removeConsole(console.id)}
              />
            </DraggableWindow>
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
