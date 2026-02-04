import { useState, useCallback, useRef, useEffect } from "react";

export interface SerialPortConfig {
  baudRate: number;
  dataBits?: 7 | 8;
  stopBits?: 1 | 2;
  parity?: "none" | "even" | "odd";
  flowControl?: "none" | "hardware";
}

export interface UseSerialPortReturn {
  port: SerialPort | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  connect: (config: SerialPortConfig) => Promise<void>;
  connectWithPort: (
    port: SerialPort,
    config: SerialPortConfig,
  ) => Promise<void>;
  disconnect: () => Promise<void>;
  sendData: (data: string) => Promise<void>;
  receivedData: string;
  clearData: () => void;
}

export function useSerialPort(): UseSerialPortReturn {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receivedData, setReceivedData] = useState("");

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(
    null,
  );
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(
    null,
  );
  const readLoopRef = useRef<boolean>(false);

  const connect = useCallback(async (config: SerialPortConfig) => {
    try {
      setIsConnecting(true);
      setError(null);

      // Request a port
      const selectedPort = await navigator.serial.requestPort();

      // Open the port with the specified configuration
      await selectedPort.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits ?? 8,
        stopBits: config.stopBits ?? 1,
        parity: config.parity ?? "none",
        flowControl: config.flowControl ?? "none",
      });

      setPort(selectedPort);
      setIsConnected(true);

      // Set up the writer
      if (selectedPort.writable) {
        writerRef.current = selectedPort.writable.getWriter();
      }

      // Set up the reader
      if (selectedPort.readable) {
        const reader = selectedPort.readable.getReader();
        readerRef.current = reader;
        readLoopRef.current = true;

        // Start reading loop
        (async () => {
          const decoder = new TextDecoder();
          try {
            while (readLoopRef.current) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              if (value) {
                const text = decoder.decode(value, { stream: true });
                setReceivedData((prev) => prev + text);
              }
            }
          } catch (err) {
            if (err instanceof Error && err.name !== "NetworkError") {
              console.error("Serial read error:", err);
              setError(err.message);
            }
          } finally {
            reader.releaseLock();
          }
        })();
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to connect";
      setError(errorMsg);
      setIsConnected(false);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const connectWithPort = useCallback(
    async (selectedPort: SerialPort, config: SerialPortConfig) => {
      try {
        setIsConnecting(true);
        setError(null);

        // Port is already opened by the reusable transport
        // Check if it's already open, if not open it
        if (!selectedPort.readable || !selectedPort.writable) {
          await selectedPort.open({
            baudRate: config.baudRate,
            dataBits: config.dataBits ?? 8,
            stopBits: config.stopBits ?? 1,
            parity: config.parity ?? "none",
            flowControl: config.flowControl ?? "none",
          });
        }

        setPort(selectedPort);
        setIsConnected(true);

        // Set up the writer
        if (selectedPort.writable) {
          writerRef.current = selectedPort.writable.getWriter();
        }

        // Set up the reader
        if (selectedPort.readable) {
          const reader = selectedPort.readable.getReader();
          readerRef.current = reader;
          readLoopRef.current = true;

          // Start reading loop
          (async () => {
            const decoder = new TextDecoder();
            try {
              while (readLoopRef.current) {
                const { value, done } = await reader.read();
                if (done) {
                  break;
                }
                if (value) {
                  const text = decoder.decode(value, { stream: true });
                  setReceivedData((prev) => prev + text);
                }
              }
            } catch (err) {
              if (err instanceof Error && err.name !== "NetworkError") {
                console.error("Serial read error:", err);
                setError(err.message);
              }
            } finally {
              reader.releaseLock();
            }
          })();
        }
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : "Failed to connect with port";
        setError(errorMsg);
        setIsConnected(false);
      } finally {
        setIsConnecting(false);
      }
    },
    [],
  );

  const disconnect = useCallback(async () => {
    try {
      // Stop the read loop
      readLoopRef.current = false;

      // Release the reader
      if (readerRef.current) {
        try {
          await readerRef.current.cancel();
        } catch (err) {
          console.error("Error canceling reader:", err);
        }
        readerRef.current = null;
      }

      // Release the writer
      if (writerRef.current) {
        try {
          await writerRef.current.close();
        } catch (err) {
          console.error("Error closing writer:", err);
        }
        writerRef.current = null;
      }

      // Close the port
      if (port) {
        await port.close();
        setPort(null);
      }

      setIsConnected(false);
    } catch (err) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to disconnect";
      setError(errorMsg);
    }
  }, [port]);

  const sendData = useCallback(async (data: string) => {
    if (!writerRef.current) {
      throw new Error("Port not open for writing");
    }

    const encoder = new TextEncoder();
    const encoded = encoder.encode(data);
    await writerRef.current.write(encoded);
  }, []);

  const clearData = useCallback(() => {
    setReceivedData("");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (readerRef.current || writerRef.current || port) {
        disconnect();
      }
    };
  }, [disconnect, port]);

  return {
    port,
    isConnected,
    isConnecting,
    error,
    connect,
    connectWithPort,
    disconnect,
    sendData,
    receivedData,
    clearData,
  };
}
