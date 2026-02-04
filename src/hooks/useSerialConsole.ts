import { useState, useCallback, useRef, useEffect } from "react";

export interface SerialConsoleMessage {
  timestamp: Date;
  text: string;
  type: "received" | "sent";
}

export interface SerialConsoleSettings {
  baudRate: number;
  filterRegex: string;
  replacePattern: string;
  replaceWith: string;
}

export interface UseSerialConsoleReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  messages: SerialConsoleMessage[];
  settings: SerialConsoleSettings;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => Promise<void>;
  clearMessages: () => void;
  updateSettings: (settings: Partial<SerialConsoleSettings>) => void;
}

export function useSerialConsole(): UseSerialConsoleReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<SerialConsoleMessage[]>([]);
  const [settings, setSettings] = useState<SerialConsoleSettings>({
    baudRate: 115200,
    filterRegex: "",
    replacePattern: "",
    replaceWith: "",
  });

  const portRef = useRef<SerialPort | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null,
  );

  const disconnect = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    if (writerRef.current) {
      writerRef.current.close();
      writerRef.current = null;
    }
    if (portRef.current) {
      portRef.current.close();
      portRef.current = null;
    }
    setIsConnected(false);
    setError(null);
  }, []);

  const processLine = useCallback(
    (line: string): string | null => {
      // Apply regex filter if set
      if (settings.filterRegex) {
        try {
          const regex = new RegExp(settings.filterRegex);
          if (!regex.test(line)) {
            return null;
          }
        } catch {
          // Invalid regex, skip filtering
        }
      }

      // Apply sed-style replacement if set
      if (settings.replacePattern) {
        try {
          const regex = new RegExp(settings.replacePattern, "g");
          return line.replace(regex, settings.replaceWith);
        } catch {
          // Invalid regex, return original
          return line;
        }
      }

      return line;
    },
    [settings.filterRegex, settings.replacePattern, settings.replaceWith],
  );

  const connect = useCallback(async () => {
    if (!("serial" in navigator)) {
      setError("Web Serial API is not supported in this browser");
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const port = await navigator.serial!.requestPort();
      await port.open({ baudRate: settings.baudRate });

      portRef.current = port;
      setIsConnected(true);
      setIsConnecting(false);

      // Start reading from the port
      const reader = port.readable?.getReader();
      if (reader) {
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                const processedLine = processLine(line.trim());
                if (processedLine !== null && processedLine !== "") {
                  setMessages((prev) => [
                    ...prev,
                    {
                      timestamp: new Date(),
                      text: processedLine,
                      type: "received",
                    },
                  ]);
                }
              }
            }
          } catch (err) {
            if ((err as Error).name !== "AbortError") {
              setError((err as Error).message);
            }
          }
        })();
      }

      // Get writer for sending data
      const writer = port.writable?.getWriter();
      if (writer) {
        writerRef.current = writer;
      }
    } catch (err) {
      setError((err as Error).message);
      setIsConnecting(false);
    }
  }, [settings.baudRate, processLine]);

  const sendMessage = useCallback(async (text: string) => {
    if (!writerRef.current) {
      setError("No active connection");
      return;
    }

    try {
      const encoder = new TextEncoder();
      await writerRef.current.write(encoder.encode(text + "\n"));

      setMessages((prev) => [
        ...prev,
        {
          timestamp: new Date(),
          text,
          type: "sent",
        },
      ]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const updateSettings = useCallback(
    (newSettings: Partial<SerialConsoleSettings>) => {
      setSettings((prev) => ({ ...prev, ...newSettings }));
    },
    [],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    isConnecting,
    error,
    messages,
    settings,
    connect,
    disconnect,
    sendMessage,
    clearMessages,
    updateSettings,
  };
}
