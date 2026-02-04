import type { ReactNode } from "react";
import { createContext, useCallback, useContext } from "react";
import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import { connect as connectBLE } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as connectDemo } from "../lib/transport/demo";
import { connectReusableSerial } from "../lib/transport/reusableSerial";
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
        // For serial, use reusable transport
        connectFn = connectReusableSerial;
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
        let connectFn;
        if (method === "ble") {
          connectFn = connectBLE;
        } else if (method === "demo") {
          connectFn = connectDemo;
        }
        if (connectFn) {
          await zmkApp.connect(connectFn);
        }
        return true;
      }

      // For serial connections, use reusable transport
      let transport;
      try {
        transport = await connectReusableSerial();
      } catch (err) {
        console.error("Failed to open serial port:", err);
        return false;
      }

      // Try ZMK connection
      await zmkApp.connect(async () => transport);

      // Check if connection succeeded by checking error state
      if (zmkApp.state.error) {
        // ZMK connection failed, release the port and open serial console
        console.log("ZMK connection failed, opening serial console...");

        const port = transport.release();
        if (port && consoleContext) {
          consoleContext.addConsoleFromPort(port);
        }

        return false;
      }

      return true;
    },
    [zmkApp, consoleContext],
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
