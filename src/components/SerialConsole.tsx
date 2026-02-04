import { useRef, useEffect, useState } from "react";
import {
  IconTerminal,
  IconPlug,
  IconPlugOff,
  IconSend,
  IconTrash,
  IconSettings,
  IconFilter,
} from "@tabler/icons-react";
import { useSerialConsole } from "../hooks/useSerialConsole";

interface SerialConsoleProps {
  /** Whether to auto-connect on mount */
  autoConnect?: boolean;
  /** Callback when connection state changes */
  onConnectionChange?: (connected: boolean) => void;
}

export function SerialConsole({
  autoConnect,
  onConnectionChange,
}: SerialConsoleProps) {
  const {
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
  } = useSerialConsole();

  const [inputText, setInputText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-connect on mount if requested
  useEffect(() => {
    if (autoConnect && !isConnected && !isConnecting) {
      connect();
    }
  }, [autoConnect, isConnected, isConnecting, connect]);

  // Notify parent of connection state changes
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

  const handleSend = async () => {
    if (inputText.trim()) {
      await sendMessage(inputText);
      setInputText("");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg)]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="flex items-center gap-2">
          <IconTerminal size={20} className="text-[var(--color-electric)]" />
          <span className="text-sm font-medium text-[var(--color-text)]">
            Serial Console
          </span>
          {isConnected && (
            <span className="status-indicator connected" aria-label="Connected" />
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded hover:bg-[var(--color-border)] ${
              showSettings
                ? "text-[var(--color-electric)]"
                : "text-[var(--color-text-muted)]"
            }`}
            aria-label="Settings"
            title="Settings"
          >
            <IconSettings size={18} />
          </button>
          <button
            onClick={clearMessages}
            className="p-1.5 rounded hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            aria-label="Clear messages"
            title="Clear messages"
          >
            <IconTrash size={18} />
          </button>
          {isConnected ? (
            <button
              onClick={disconnect}
              className="btn-ghost text-xs flex items-center gap-1"
            >
              <IconPlugOff size={16} />
              Disconnect
            </button>
          ) : (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="btn-electric text-xs flex items-center gap-1"
            >
              <IconPlug size={16} />
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
                Baud Rate
              </label>
              <select
                value={settings.baudRate}
                onChange={(e) =>
                  updateSettings({ baudRate: Number(e.target.value) })
                }
                disabled={isConnected}
                className="input-field text-sm"
              >
                <option value={9600}>9600</option>
                <option value={19200}>19200</option>
                <option value={38400}>38400</option>
                <option value={57600}>57600</option>
                <option value={115200}>115200</option>
                <option value={230400}>230400</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] mb-1 block flex items-center gap-1">
                <IconFilter size={14} />
                Filter (Regex)
              </label>
              <input
                type="text"
                value={settings.filterRegex}
                onChange={(e) => updateSettings({ filterRegex: e.target.value })}
                placeholder="e.g., ^ERROR"
                className="input-field text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
                Replace Pattern (Regex)
              </label>
              <input
                type="text"
                value={settings.replacePattern}
                onChange={(e) =>
                  updateSettings({ replacePattern: e.target.value })
                }
                placeholder="e.g., \\d{3}"
                className="input-field text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--color-text-muted)] mb-1 block">
                Replace With
              </label>
              <input
                type="text"
                value={settings.replaceWith}
                onChange={(e) => updateSettings({ replaceWith: e.target.value })}
                placeholder="e.g., XXX"
                className="input-field text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs">
        {!isConnected && !error && (
          <div className="flex items-center justify-center h-full text-[var(--color-text-muted)]">
            <div className="text-center">
              <IconTerminal
                size={48}
                className="mx-auto mb-4 opacity-20"
                strokeWidth={1}
              />
              <p>Not connected</p>
              <p className="text-xs mt-1">
                Click Connect to start a serial console session
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`mb-1 ${
              msg.type === "sent"
                ? "text-[var(--color-neon)]"
                : "text-[var(--color-text-secondary)]"
            }`}
          >
            <span className="text-[var(--color-text-muted)] mr-2">
              {msg.timestamp.toLocaleTimeString()}
            </span>
            <span className="mr-2">
              {msg.type === "sent" ? "→" : "←"}
            </span>
            <span>{msg.text}</span>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      {isConnected && (
        <div className="px-4 py-3 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message and press Enter..."
              className="input-field text-sm flex-1"
            />
            <button
              onClick={handleSend}
              disabled={!inputText.trim()}
              className="btn-electric p-2"
              aria-label="Send message"
            >
              <IconSend size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
