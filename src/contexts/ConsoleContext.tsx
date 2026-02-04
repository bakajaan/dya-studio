import { createContext, useState, useCallback, useRef, ReactNode } from "react";
import type { WindowPosition } from "../components/DraggableWindow";

export interface ConsoleWindow {
  id: string;
  position: WindowPosition;
  zIndex: number;
  snapPosition?: "left" | "right" | "top" | "bottom" | null;
  port?: SerialPort;
}

interface ConsoleContextValue {
  consoles: ConsoleWindow[];
  maxZIndex: number;
  addConsole: () => void;
  removeConsole: (id: string) => void;
  updateConsole: (id: string, updates: Partial<ConsoleWindow>) => void;
  bringToFront: (id: string) => void;
  snapConsole: (
    id: string,
    snapPosition: "left" | "right" | "top" | "bottom",
  ) => void;
  snapOut: (id: string) => void;
  restoreSnapState: () => void;
  exitToWindowMode: () => void;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

interface ConsoleProviderProps {
  children: ReactNode;
}

export function ConsoleProvider({ children }: ConsoleProviderProps) {
  const [consoles, setConsoles] = useState<ConsoleWindow[]>([]);
  const [maxZIndex, setMaxZIndex] = useState(1000);
  const nextIdRef = useRef(1);
  const savedSnapStatesRef = useRef<
    Map<string, "left" | "right" | "top" | "bottom" | null>
  >(new Map());

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
    savedSnapStatesRef.current.delete(id);
  }, []);

  const updateConsole = useCallback(
    (id: string, updates: Partial<ConsoleWindow>) => {
      setConsoles((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      );
    },
    [],
  );

  const bringToFront = useCallback(
    (id: string) => {
      setConsoles((prev) =>
        prev.map((c) => (c.id === id ? { ...c, zIndex: maxZIndex + 1 } : c)),
      );
      setMaxZIndex((prev) => prev + 1);
    },
    [maxZIndex],
  );

  const snapConsole = useCallback(
    (id: string, snapPosition: "left" | "right" | "top" | "bottom") => {
      setConsoles((prev) => {
        const console = prev.find((c) => c.id === id);
        if (!console) return prev;

        // Save snap state
        savedSnapStatesRef.current.set(id, snapPosition);

        return prev.map((c) => (c.id === id ? { ...c, snapPosition } : c));
      });
    },
    [],
  );

  const snapOut = useCallback((id: string) => {
    setConsoles((prev) => {
      const console = prev.find((c) => c.id === id);
      if (!console) return prev;

      // Move to center with default size
      const newPosition: WindowPosition = {
        x: 100,
        y: 100,
        width: 600,
        height: 400,
      };

      return prev.map((c) =>
        c.id === id ? { ...c, position: newPosition, snapPosition: null } : c,
      );
    });
  }, []);

  const exitToWindowMode = useCallback(() => {
    // Save current snap states
    consoles.forEach((console) => {
      if (console.snapPosition) {
        savedSnapStatesRef.current.set(console.id, console.snapPosition);
      }
    });

    // Convert all snapped consoles to window mode
    setConsoles((prev) =>
      prev.map((c) => {
        if (c.snapPosition) {
          return {
            ...c,
            position: {
              x: 100 + Math.random() * 100,
              y: 100 + Math.random() * 100,
              width: 600,
              height: 400,
            },
            snapPosition: null,
          };
        }
        return c;
      }),
    );
  }, [consoles]);

  const restoreSnapState = useCallback(() => {
    // Restore saved snap states
    setConsoles((prev) =>
      prev.map((c) => {
        const savedSnapState = savedSnapStatesRef.current.get(c.id);
        if (savedSnapState) {
          return { ...c, snapPosition: savedSnapState };
        }
        return c;
      }),
    );
  }, []);

  const value: ConsoleContextValue = {
    consoles,
    maxZIndex,
    addConsole,
    removeConsole,
    updateConsole,
    bringToFront,
    snapConsole,
    snapOut,
    restoreSnapState,
    exitToWindowMode,
  };

  return (
    <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>
  );
}

export { ConsoleContext };
