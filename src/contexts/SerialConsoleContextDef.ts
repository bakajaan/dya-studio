import { createContext, useContext } from "react";

export type ConsolePosition = "tab" | "window" | "hidden";

export interface SerialConsoleContextValue {
  /** Current position of the console */
  position: ConsolePosition;
  /** Whether the console has an active connection */
  hasActiveConnection: boolean;
  /** Show console in a draggable window */
  showAsWindow: () => void;
  /** Show console in the tab */
  showInTab: () => void;
  /** Hide console */
  hide: () => void;
  /** Set connection state */
  setConnectionState: (connected: boolean) => void;
}

export const SerialConsoleContext = createContext<SerialConsoleContextValue>({
  position: "hidden",
  hasActiveConnection: false,
  showAsWindow: () => {},
  showInTab: () => {},
  hide: () => {},
  setConnectionState: () => {},
});

export function useSerialConsoleContext() {
  return useContext(SerialConsoleContext);
}
