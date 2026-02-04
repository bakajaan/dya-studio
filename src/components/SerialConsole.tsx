import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  IconTerminal,
  IconSend,
  IconFilter,
  IconClearAll,
  IconX,
  IconSettings,
} from "@tabler/icons-react";
import { useSerialPort } from "../hooks/useSerialPort";
import type { SerialPortConfig } from "../hooks/useSerialPort";

interface SerialConsoleProps {
  consoleId: string;
  onClose?: () => void;
  isSnapped?: boolean;
  onSnapOut?: () => void;
  existingPort?: SerialPort;
}

export function SerialConsole({
  consoleId,
  onClose,
  isSnapped = false,
  onSnapOut,
  existingPort,
}: SerialConsoleProps) {
  const {
    isConnected,
    isConnecting,
    error,
    connect,
    connectWithPort,
    disconnect,
    sendData,
    receivedData,
    clearData,
  } = useSerialPort();

  const [showConfig, setShowConfig] = useState(!isConnected && !existingPort);
  const [baudRate, setBaudRate] = useState("115200");
  const [inputText, setInputText] = useState("");
  const [filterRegex, setFilterRegex] = useState("");
  const [replacePattern, setReplacePattern] = useState("");
  const [replaceWith, setReplaceWith] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);

  // Auto-connect if we have an existing port
  useEffect(() => {
    if (existingPort && !isConnected) {
      connectWithPort(existingPort, { baudRate: parseInt(baudRate, 10) });
    }
  }, [existingPort, isConnected, connectWithPort, baudRate]);

  // Auto-scroll to bottom when new data arrives
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [receivedData]);

  const handleConnect = useCallback(async () => {
    const config: SerialPortConfig = {
      baudRate: parseInt(baudRate, 10),
    };
    await connect(config);
    setShowConfig(false);
  }, [connect, baudRate]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setShowConfig(true);
  }, [disconnect]);

  const handleSend = useCallback(async () => {
    if (!inputText.trim()) return;
    try {
      await sendData(inputText + "\n");
      setInputText("");
    } catch (err) {
      console.error("Failed to send:", err);
    }
  }, [inputText, sendData]);

  const handleKeyPress = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Apply filtering and replacement
  const processedData = useMemo(() => {
    let lines = receivedData.split("\n");

    // Apply regex filter
    if (filterRegex.trim()) {
      try {
        const regex = new RegExp(filterRegex, "i");
        lines = lines.filter((line) => regex.test(line));
      } catch {
        // Invalid regex, skip filtering
      }
    }

    // Apply sed-style replacement
    if (replacePattern.trim() && replaceWith !== undefined) {
      try {
        const regex = new RegExp(replacePattern, "g");
        lines = lines.map((line) => line.replace(regex, replaceWith));
      } catch {
        // Invalid regex, skip replacement
      }
    }

    return lines.join("\n");
  }, [receivedData, filterRegex, replacePattern, replaceWith]);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <div className="flex items-center gap-2">
          <IconTerminal size={16} className="text-[var(--color-electric)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">
            Serial Console {consoleId.replace(/^console-/, "#")}
          </span>
          {isConnected && (
            <div className="w-2 h-2 rounded-full bg-[var(--color-neon)] animate-pulse" />
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="p-1 rounded hover:bg-[var(--color-border)] transition-colors"
            title="Toggle filters"
          >
            <IconFilter size={16} className="text-[var(--color-text-muted)]" />
          </button>
          <button
            onClick={clearData}
            className="p-1 rounded hover:bg-[var(--color-border)] transition-colors"
            title="Clear console"
          >
            <IconClearAll
              size={16}
              className="text-[var(--color-text-muted)]"
            />
          </button>
          {isSnapped && onSnapOut && (
            <button
              onClick={onSnapOut}
              className="px-2 py-1 text-xs rounded bg-[var(--color-electric)]/10 text-[var(--color-electric)] hover:bg-[var(--color-electric)]/20 transition-colors"
              title="Snap out to window"
            >
              Pop Out
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-[var(--color-border)] transition-colors"
              title="Close console"
            >
              <IconX size={16} className="text-[var(--color-text-muted)]" />
            </button>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/50 space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-muted)] w-20">
              Filter:
            </label>
            <input
              type="text"
              value={filterRegex}
              onChange={(e) => setFilterRegex(e.target.value)}
              placeholder="Regex pattern..."
              className="flex-1 input-field text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[var(--color-text-muted)] w-20">
              Replace:
            </label>
            <input
              type="text"
              value={replacePattern}
              onChange={(e) => setReplacePattern(e.target.value)}
              placeholder="Pattern..."
              className="flex-1 input-field text-xs"
            />
            <span className="text-xs text-[var(--color-text-muted)]">→</span>
            <input
              type="text"
              value={replaceWith}
              onChange={(e) => setReplaceWith(e.target.value)}
              placeholder="Replacement..."
              className="flex-1 input-field text-xs"
            />
          </div>
        </div>
      )}

      {/* Configuration Panel */}
      {showConfig && (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="glass-card p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-[var(--color-electric)]/10 border border-[var(--color-electric)]/20">
                <IconSettings
                  size={24}
                  className="text-[var(--color-electric)]"
                />
              </div>
              <h3 className="text-lg font-medium text-[var(--color-text)]">
                Serial Port Configuration
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[var(--color-text-secondary)] mb-2">
                  Baud Rate
                </label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(e.target.value)}
                  className="w-full input-field"
                >
                  <option value="9600">9600</option>
                  <option value="19200">19200</option>
                  <option value="38400">38400</option>
                  <option value="57600">57600</option>
                  <option value="115200">115200</option>
                  <option value="230400">230400</option>
                  <option value="460800">460800</option>
                  <option value="921600">921600</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="flex-1 btn-electric"
                >
                  {isConnecting ? "Connecting..." : "Connect"}
                </button>
                {onClose && (
                  <button onClick={onClose} className="btn-ghost">
                    Cancel
                  </button>
                )}
              </div>

              {error && (
                <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/30">
                  <p className="text-xs text-red-500">{error}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Terminal Display */}
      {!showConfig && isConnected && (
        <>
          <div
            ref={terminalRef}
            className="flex-1 p-4 overflow-auto font-mono text-xs text-[var(--color-text)] bg-black/20"
            style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
          >
            {processedData}
          </div>

          {/* Input Area */}
          <div className="flex items-center gap-2 p-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type message and press Enter..."
              className="flex-1 input-field text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="btn-electric px-3 py-1.5"
              title="Send message"
            >
              <IconSend size={16} />
            </button>
            <button
              onClick={handleDisconnect}
              className="btn-ghost px-3 py-1.5 text-sm"
            >
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
