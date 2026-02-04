import { type ReactNode, useState, useCallback, useRef, useEffect } from "react";
import { useZMKApp, ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import { connect as connectSerial } from "@zmkfirmware/zmk-studio-ts-client/transport/serial";
import { connect as connectBLE } from "@zmkfirmware/zmk-studio-ts-client/transport/gatt";
import { connect as connectDemo } from "../lib/transport/demo";
import type { RpcTransport } from "@zmkfirmware/zmk-studio-ts-client/transport/index";
import { useSerialConsole } from "../hooks/useSerialConsole";
import { AppStateContext, type AppState, type AppStateContextValue } from "./AppStateContextDef";

export type ConnectionMethod = "serial" | "ble" | "demo";

interface AppStateProviderProps {
  children: ReactNode;
}

// Helper to detect if connection output looks like ZMK logs
function looksLikeZMKLog(text: string): boolean {
  const zmkPatterns = [
    /\*\*\* Booting/,
    /\[00:00:00\.\d+,\d+\]/,
    /zmk/i,
    /bluetooth/i,
    /ble/i,
    /keyboard/i,
  ];
  return zmkPatterns.some((pattern) => pattern.test(text));
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const zmkApp = useZMKApp();
  const serialConsole = useSerialConsole();
  const [appState, setAppState] = useState<AppState>("A");
  const pendingTransportRef = useRef<RpcTransport | null>(null);

  // Calculate current state based on connections
  const zmkConnected = zmkApp.isConnected;
  const serialConnected = serialConsole.isConnected;

  // Update app state based on connections and tab state
  useEffect(() => {
    if (!zmkConnected && !serialConnected) {
      setAppState("A");
    } else if (zmkConnected && !serialConnected) {
      setAppState("B");
    } else if (!zmkConnected && serialConnected) {
      setAppState("C");
    }
    // States D and E are set explicitly by tab navigation
  }, [zmkConnected, serialConnected]);

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

      try {
        const transport = await connectFn();
        pendingTransportRef.current = transport;

        // Try to connect as ZMK Studio
        try {
          await zmkApp.connect(async () => transport);
          // Success - we're in state B
          pendingTransportRef.current = null;
        } catch (err) {
          // Connection failed - try to detect if it's serial logs
          // Read some data to see if it looks like logs
          const reader = transport.readable.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let detectedLog = false;

          // Read for a short time to detect logs
          const timeout = setTimeout(() => {
            reader.cancel();
          }, 1000);

          try {
            for (let i = 0; i < 10; i++) {
              const { value, done } = await reader.read();
              if (done) break;
              
              buffer += decoder.decode(value, { stream: true });
              if (looksLikeZMKLog(buffer)) {
                detectedLog = true;
                break;
              }
            }
          } catch {
            // Ignore read errors
          } finally {
            clearTimeout(timeout);
            reader.releaseLock();
          }

          if (detectedLog) {
            // Use this connection for serial console - state C
            serialConsole.connectWithTransport(transport);
            pendingTransportRef.current = null;
          } else {
            // Not a log, just throw the original error
            throw err;
          }
        }
      } catch (err) {
        // Connection completely failed
        console.error("Connection failed:", err);
      }
    },
    [zmkApp, serialConsole],
  );

  const handleDisconnect = useCallback(() => {
    zmkApp.disconnect();
    if (appState === "B") {
      setAppState("A");
    } else if (appState === "D" || appState === "E") {
      setAppState("C");
    }
  }, [zmkApp, appState]);

  const handleSerialConnect = useCallback(async () => {
    await serialConsole.connect();
    if (zmkConnected) {
      setAppState("D"); // Console tab will be activated
    } else {
      setAppState("C");
    }
  }, [serialConsole, zmkConnected]);

  const handleSerialDisconnect = useCallback(() => {
    serialConsole.disconnect();
    if (zmkConnected) {
      setAppState("B");
    } else {
      setAppState("A");
    }
  }, [serialConsole, zmkConnected]);

  const handleConsoleTabActivated = useCallback(() => {
    if (zmkConnected && serialConnected) {
      setAppState("D");
    }
  }, [zmkConnected, serialConnected]);

  const handleOtherTabActivated = useCallback(() => {
    if (zmkConnected && serialConnected && appState === "D") {
      setAppState("E");
    }
  }, [zmkConnected, serialConnected, appState]);

  const contextValue: AppStateContextValue = {
    state: appState,
    zmkConnected,
    serialConnected,
    deviceName: zmkApp.state.deviceInfo?.name,
    isLoading: zmkApp.state.isLoading || serialConsole.isConnecting,
    error: zmkApp.state.error || serialConsole.error,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onSerialConnect: handleSerialConnect,
    onSerialDisconnect: handleSerialDisconnect,
    onConsoleTabActivated: handleConsoleTabActivated,
    onOtherTabActivated: handleOtherTabActivated,
    serialConsole,
  };

  return (
    <ZMKAppContext.Provider value={zmkApp}>
      <AppStateContext.Provider value={contextValue}>
        {children}
      </AppStateContext.Provider>
    </ZMKAppContext.Provider>
  );
}

export { AppStateContext };
