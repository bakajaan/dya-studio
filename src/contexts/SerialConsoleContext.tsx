import { type ReactNode, useState, useCallback } from "react";
import { SerialConsoleContext } from "./SerialConsoleContextDef";

interface SerialConsoleProviderProps {
  children: ReactNode;
}

export function SerialConsoleProvider({ children }: SerialConsoleProviderProps) {
  const [position, setPosition] = useState<"tab" | "window" | "hidden">("hidden");
  const [hasActiveConnection, setHasActiveConnection] = useState(false);

  const showAsWindow = useCallback(() => {
    setPosition("window");
  }, []);

  const showInTab = useCallback(() => {
    setPosition("tab");
  }, []);

  const hide = useCallback(() => {
    setPosition("hidden");
  }, []);

  const setConnectionState = useCallback((connected: boolean) => {
    setHasActiveConnection(connected);
  }, []);

  return (
    <SerialConsoleContext.Provider
      value={{
        position,
        hasActiveConnection,
        showAsWindow,
        showInTab,
        hide,
        setConnectionState,
      }}
    >
      {children}
    </SerialConsoleContext.Provider>
  );
}
