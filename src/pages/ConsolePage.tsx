import { useState, useCallback, useRef } from "react";
import { IconTerminal2, IconPlus } from "@tabler/icons-react";
import { SerialConsole } from "../components/SerialConsole";
import { DraggableWindow } from "../components/DraggableWindow";
import type { WindowPosition } from "../components/DraggableWindow";

interface ConsoleWindow {
  id: string;
  position: WindowPosition;
  zIndex: number;
  snapPosition?: "left" | "right" | "top" | "bottom" | null;
}

type SnapPosition = "left" | "right" | "top" | "bottom" | null;

export function ConsolePage() {
  const [consoles, setConsoles] = useState<ConsoleWindow[]>([]);
  const [maxZIndex, setMaxZIndex] = useState(1000);
  const [draggedConsoleId, setDraggedConsoleId] = useState<string | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapPosition>(null);
  const nextIdRef = useRef(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const addConsole = useCallback(() => {
    const id = `console-${nextIdRef.current++}`;
    const newConsole: ConsoleWindow = {
      id,
      position: {
        x: 100 + ((consoles.length * 30) % 200),
        y: 100 + ((consoles.length * 30) % 200),
        width: 600,
        height: 400,
      },
      zIndex: maxZIndex + 1,
      snapPosition: null,
    };
    setConsoles((prev) => [...prev, newConsole]);
    setMaxZIndex((prev) => prev + 1);
  }, [consoles.length, maxZIndex]);

  const removeConsole = useCallback((id: string) => {
    setConsoles((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const bringToFront = useCallback(
    (id: string) => {
      setConsoles((prev) =>
        prev.map((c) => (c.id === id ? { ...c, zIndex: maxZIndex + 1 } : c)),
      );
      setMaxZIndex((prev) => prev + 1);
    },
    [maxZIndex],
  );

  const updatePosition = useCallback((id: string, position: WindowPosition) => {
    setConsoles((prev) =>
      prev.map((c) => (c.id === id ? { ...c, position } : c)),
    );
  }, []);

  const snapConsole = useCallback((id: string, snapPos: SnapPosition) => {
    if (!snapPos || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();

    setConsoles((prev) => {
      const consolesToSnap = prev.filter(
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

      // Update positions of all consoles in this snap area
      const updated = prev.map((c) => {
        if (c.id === id) {
          return { ...c, position: newPosition, snapPosition: snapPos };
        }
        if (c.snapPosition === snapPos) {
          // Recalculate positions for existing snapped consoles
          const consoleIndex = othersSnapped.findIndex((oc) => oc.id === c.id);
          if (consoleIndex >= 0) {
            if (snapPos === "left" || snapPos === "right") {
              const width = rect.width / 2 / totalInSnap;
              const height = rect.height;
              return {
                ...c,
                position: {
                  x:
                    snapPos === "left"
                      ? consoleIndex * width
                      : rect.width / 2 + consoleIndex * width,
                  y: 0,
                  width,
                  height,
                },
              };
            } else {
              const width = rect.width;
              const height = rect.height / 2 / totalInSnap;
              return {
                ...c,
                position: {
                  x: 0,
                  y:
                    snapPos === "top"
                      ? consoleIndex * height
                      : rect.height / 2 + consoleIndex * height,
                  width,
                  height,
                },
              };
            }
          }
        }
        return c;
      });

      return updated;
    });
  }, []);

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
        snapConsole(id, snapPos);
      }

      setDraggedConsoleId(null);
      setSnapPreview(null);
    },
    [snapConsole],
  );

  const snapOut = useCallback((id: string) => {
    setConsoles((prev) => {
      const console = prev.find((c) => c.id === id);
      if (!console || !console.snapPosition) return prev;

      const snapPos = console.snapPosition;

      // Move to center with default size
      const newPosition: WindowPosition = {
        x: 100,
        y: 100,
        width: 600,
        height: 400,
      };

      const updated = prev.map((c) =>
        c.id === id ? { ...c, position: newPosition, snapPosition: null } : c,
      );

      // Recalculate positions for remaining consoles in the snap area
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const remaining = updated.filter((c) => c.snapPosition === snapPos);

        if (remaining.length > 0) {
          return updated.map((c) => {
            if (c.snapPosition === snapPos) {
              const index = remaining.findIndex((rc) => rc.id === c.id);
              if (index >= 0) {
                if (snapPos === "left" || snapPos === "right") {
                  const width = rect.width / 2 / remaining.length;
                  const height = rect.height;
                  return {
                    ...c,
                    position: {
                      x:
                        snapPos === "left"
                          ? index * width
                          : rect.width / 2 + index * width,
                      y: 0,
                      width,
                      height,
                    },
                  };
                } else {
                  const width = rect.width;
                  const height = rect.height / 2 / remaining.length;
                  return {
                    ...c,
                    position: {
                      x: 0,
                      y:
                        snapPos === "top"
                          ? index * height
                          : rect.height / 2 + index * height,
                      width,
                      height,
                    },
                  };
                }
              }
            }
            return c;
          });
        }
      }

      return updated;
    });
  }, []);

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
                onSnapOut={() => snapOut(console.id)}
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
