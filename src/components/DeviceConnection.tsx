import type { ReactNode } from "react";
import { createContext, useCallback, useContext } from "react";
import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import { connect as connectSerial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as connectBLE } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as connectDemo } from "../lib/transport/demo";
import { ConsoleContext } from "../contexts/ConsoleContext";

export type ConnectionMethod = "serial" | "ble" | "demo";

// Simple connection context for UI components
interface ConnectionContextValue {
  isConnected: boolean;
  deviceName: string | undefined;
  onConnect: (method: ConnectionMethod) => void;
  onDisconnect: () => void;
  isLoading: boolean;
  error: string | null;
  onConnectWithFallback: (method: ConnectionMethod) => Promise<boolean>;
}

const ConnectionContext = createContext<ConnectionContextValue>({
  isConnected: false,
  deviceName: undefined,
  onConnect: () => {},
  onDisconnect: () => {},
  isLoading: false,
  error: null,
  onConnectWithFallback: async () => false,
});

interface DeviceConnectionProviderProps {
  children: ReactNode;
}

export function DeviceConnectionProvider({
  children,
}: DeviceConnectionProviderProps) {
  const zmkApp = useZMKApp();
  const consoleContext = useContext(ConsoleContext);

  const handleConnect = useCallback(
    async (method: ConnectionMethod) => {
      let connectFn;
      if (method === "ble") {
        connectFn = connectBLE;
      } else if (method === "demo") {
        connectFn = connectDemo;
      } else {
        connectFn = connectSerial;
      }
      await zmkApp.connect(connectFn);
    },
    [zmkApp],
  );

  // Connect with fallback to serial console if ZMK connection fails
  const handleConnectWithFallback = useCallback(
    async (method: ConnectionMethod): Promise<boolean> => {
      if (method !== "serial") {
        // Non-serial connections don't have fallback
        await handleConnect(method);
        return true;
      }

      try {
        // Try ZMK connection with timeout
        const connectPromise = handleConnect(method);
        const timeoutPromise = new Promise<void>((_, reject) => {
          setTimeout(() => reject(new Error("Connection timeout")), 5000);
        });

        await Promise.race([connectPromise, timeoutPromise]);
        return true;
      } catch {
        // ZMK connection failed, fallback to serial console
        console.log("ZMK connection failed, opening serial console...");

        // Add a serial console (user will need to select port again)
        if (consoleContext) {
          consoleContext.addConsole();
        }

        return false;
      }
    },
    [handleConnect, consoleContext],
  );

  const handleDisconnect = useCallback(() => {
    zmkApp.disconnect();
  }, [zmkApp]);

  const connectionValue: ConnectionContextValue = {
    isConnected: zmkApp.isConnected,
    deviceName: zmkApp.state.deviceInfo?.name,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    isLoading: zmkApp.state.isLoading,
    error: zmkApp.state.error,
    onConnectWithFallback: handleConnectWithFallback,
  };

  return (
    <ZMKAppContext.Provider value={zmkApp}>
      <ConnectionContext.Provider value={connectionValue}>
        {children}
      </ConnectionContext.Provider>
    </ZMKAppContext.Provider>
  );
}

export { ConnectionContext };
