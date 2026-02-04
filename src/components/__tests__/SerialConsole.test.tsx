import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SerialConsole } from "../SerialConsole";

// Mock the useSerialConsole hook
jest.mock("../../hooks/useSerialConsole");

import { useSerialConsole } from "../../hooks/useSerialConsole";

const mockUseSerialConsole = useSerialConsole as jest.MockedFunction<
  typeof useSerialConsole
>;

describe("SerialConsole", () => {
  const mockConnect = jest.fn();
  const mockDisconnect = jest.fn();
  const mockSendMessage = jest.fn();
  const mockClearMessages = jest.fn();
  const mockUpdateSettings = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSerialConsole.mockReturnValue({
      isConnected: false,
      isConnecting: false,
      error: null,
      messages: [],
      settings: {
        baudRate: 115200,
        filterRegex: "",
        replacePattern: "",
        replaceWith: "",
      },
      connect: mockConnect,
      disconnect: mockDisconnect,
      sendMessage: mockSendMessage,
      clearMessages: mockClearMessages,
      updateSettings: mockUpdateSettings,
    });
  });

  describe("Initial State", () => {
    test("renders disconnected state", () => {
      render(<SerialConsole />);

      expect(screen.getByText("Serial Console")).toBeInTheDocument();
      expect(screen.getByText("Connect")).toBeInTheDocument();
      expect(screen.getByText("Not connected")).toBeInTheDocument();
    });

    test("shows connect button when disconnected", () => {
      render(<SerialConsole />);

      const connectButton = screen.getByRole("button", { name: /connect/i });
      expect(connectButton).toBeEnabled();
    });
  });

  describe("Connection Flow", () => {
    test("calls connect when connect button is clicked", async () => {
      const user = userEvent.setup();
      render(<SerialConsole />);

      const connectButton = screen.getByRole("button", { name: /connect/i });
      await user.click(connectButton);

      expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    test("shows disconnect button when connected", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(screen.getByText("Disconnect")).toBeInTheDocument();
      expect(screen.queryByText("Connect")).not.toBeInTheDocument();
    });

    test("calls disconnect when disconnect button is clicked", async () => {
      const user = userEvent.setup();
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      const disconnectButton = screen.getByRole("button", {
        name: /disconnect/i,
      });
      await user.click(disconnectButton);

      expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    test("shows connecting state", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: false,
        isConnecting: true,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(screen.getByText("Connecting...")).toBeInTheDocument();
    });
  });

  describe("Message Display", () => {
    test("displays received messages", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [
          {
            timestamp: new Date("2024-01-01T10:00:00"),
            text: "Hello from device",
            type: "received",
          },
        ],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(screen.getByText("Hello from device")).toBeInTheDocument();
    });

    test("displays sent messages", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [
          {
            timestamp: new Date("2024-01-01T10:00:00"),
            text: "Test command",
            type: "sent",
          },
        ],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(screen.getByText("Test command")).toBeInTheDocument();
    });
  });

  describe("Sending Messages", () => {
    test("shows input area when connected", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(
        screen.getByPlaceholderText(/type a message/i),
      ).toBeInTheDocument();
    });

    test("calls sendMessage when send button is clicked", async () => {
      const user = userEvent.setup();
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      const input = screen.getByPlaceholderText(/type a message/i);
      const sendButton = screen.getByRole("button", { name: /send message/i });

      await user.type(input, "test message");
      await user.click(sendButton);

      expect(mockSendMessage).toHaveBeenCalledWith("test message");
    });

    test("calls sendMessage when Enter key is pressed", async () => {
      const user = userEvent.setup();
      mockUseSerialConsole.mockReturnValue({
        isConnected: true,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      const input = screen.getByPlaceholderText(/type a message/i);

      await user.type(input, "test{Enter}");

      expect(mockSendMessage).toHaveBeenCalledWith("test");
    });
  });

  describe("Settings", () => {
    test("toggles settings panel", async () => {
      const user = userEvent.setup();
      render(<SerialConsole />);

      const settingsButton = screen.getByRole("button", { name: /settings/i });
      await user.click(settingsButton);

      expect(screen.getByText("Baud Rate")).toBeInTheDocument();
    });

    test("updates baud rate setting", async () => {
      const user = userEvent.setup();
      render(<SerialConsole />);

      const settingsButton = screen.getByRole("button", { name: /settings/i });
      await user.click(settingsButton);

      const baudRateSelect = screen.getByDisplayValue("115200");
      await user.selectOptions(baudRateSelect, "9600");

      expect(mockUpdateSettings).toHaveBeenCalledWith({ baudRate: 9600 });
    });

    test("updates filter regex", async () => {
      const user = userEvent.setup();
      render(<SerialConsole />);

      const settingsButton = screen.getByRole("button", { name: /settings/i });
      await user.click(settingsButton);

      const filterInput = screen.getByPlaceholderText("e.g., ^ERROR");
      await user.type(filterInput, "TEST");

      // Check that updateSettings was called
      expect(mockUpdateSettings).toHaveBeenCalled();
      // At least one call should have filterRegex property
      expect(mockUpdateSettings.mock.calls.some(
        call => call[0] && 'filterRegex' in call[0]
      )).toBe(true);
    });
  });

  describe("Error Handling", () => {
    test("displays error message", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: false,
        isConnecting: false,
        error: "Failed to connect to serial port",
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole />);

      expect(
        screen.getByText("Failed to connect to serial port"),
      ).toBeInTheDocument();
    });
  });

  describe("Clear Messages", () => {
    test("calls clearMessages when clear button is clicked", async () => {
      const user = userEvent.setup();
      render(<SerialConsole />);

      const clearButton = screen.getByRole("button", {
        name: /clear messages/i,
      });
      await user.click(clearButton);

      expect(mockClearMessages).toHaveBeenCalledTimes(1);
    });
  });

  describe("Auto Connect", () => {
    test("auto connects when autoConnect prop is true", () => {
      mockUseSerialConsole.mockReturnValue({
        isConnected: false,
        isConnecting: false,
        error: null,
        messages: [],
        settings: {
          baudRate: 115200,
          filterRegex: "",
          replacePattern: "",
          replaceWith: "",
        },
        connect: mockConnect,
        disconnect: mockDisconnect,
        sendMessage: mockSendMessage,
        clearMessages: mockClearMessages,
        updateSettings: mockUpdateSettings,
      });

      render(<SerialConsole autoConnect={true} />);

      expect(mockConnect).toHaveBeenCalled();
    });

    test("does not auto connect when autoConnect prop is false", () => {
      render(<SerialConsole autoConnect={false} />);

      expect(mockConnect).not.toHaveBeenCalled();
    });
  });
});
