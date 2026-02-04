import { createContext, useContext } from "react";
import type { useSerialConsole } from "../hooks/useSerialConsole";

export type AppState = "A" | "B" | "C" | "D" | "E";

export interface AppStateContextValue {
  state: AppState;
  zmkConnected: boolean;
  serialConnected: boolean;
  deviceName: string | undefined;
  isLoading: boolean;
  error: string | null;
  onConnect: (method: "serial" | "ble" | "demo") => void;
  onDisconnect: () => void;
  onSerialConnect: () => void;
  onSerialDisconnect: () => void;
  onConsoleTabActivated: () => void;
  onOtherTabActivated: () => void;
  serialConsole: ReturnType<typeof useSerialConsole>;
}

export const AppStateContext = createContext<AppStateContextValue>({
  state: "A",
  zmkConnected: false,
  serialConnected: false,
  deviceName: undefined,
  isLoading: false,
  error: null,
  onConnect: () => {},
  onDisconnect: () => {},
  onSerialConnect: () => {},
  onSerialDisconnect: () => {},
  onConsoleTabActivated: () => {},
  onOtherTabActivated: () => {},
  serialConsole: {} as ReturnType<typeof useSerialConsole>,
});

export function useAppState() {
  return useContext(AppStateContext);
}
