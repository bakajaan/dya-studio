import { render, screen } from "@testing-library/react";
import { DebugConsolePage } from "../DebugConsolePage";
import { AppStateContext } from "../../contexts/AppStateContextDef";
import type { AppStateContextValue } from "../../contexts/AppStateContextDef";

// Mock the useSerialConsole hook
const mockSerialConsole = {
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
  connect: jest.fn(),
  connectWithTransport: jest.fn(),
  disconnect: jest.fn(),
  sendMessage: jest.fn(),
  clearMessages: jest.fn(),
  updateSettings: jest.fn(),
};

describe("DebugConsolePage", () => {
  const mockOnConnect = jest.fn();
  const mockOnDisconnect = jest.fn();
  const mockOnSerialConnect = jest.fn();
  const mockOnSerialDisconnect = jest.fn();
  const mockOnConsoleTabActivated = jest.fn();
  const mockOnOtherTabActivated = jest.fn();

  const mockContextValue: AppStateContextValue = {
    state: "D",
    zmkConnected: true,
    serialConnected: true,
    deviceName: "Test Device",
    isLoading: false,
    error: null,
    onConnect: mockOnConnect,
    onDisconnect: mockOnDisconnect,
    onSerialConnect: mockOnSerialConnect,
    onSerialDisconnect: mockOnSerialDisconnect,
    onConsoleTabActivated: mockOnConsoleTabActivated,
    onOtherTabActivated: mockOnOtherTabActivated,
    serialConsole: mockSerialConsole,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders page header", () => {
    render(
      <AppStateContext.Provider value={mockContextValue}>
        <DebugConsolePage />
      </AppStateContext.Provider>,
    );

    expect(screen.getByText("Debug Console")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect to serial port for debugging/i),
    ).toBeInTheDocument();
  });

  test("renders info box with tip", () => {
    render(
      <AppStateContext.Provider value={mockContextValue}>
        <DebugConsolePage />
      </AppStateContext.Provider>,
    );

    expect(screen.getByText(/Tip:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/serial console connection is shared/i),
    ).toBeInTheDocument();
  });

  test("shows connected state when serial console is connected", () => {
    const connectedContext = {
      ...mockContextValue,
      serialConnected: true,
      serialConsole: {
        ...mockSerialConsole,
        isConnected: true,
      },
    };

    render(
      <AppStateContext.Provider value={connectedContext}>
        <DebugConsolePage />
      </AppStateContext.Provider>,
    );

    expect(screen.getByText("Serial Console")).toBeInTheDocument();
    expect(screen.getByText("Disconnect")).toBeInTheDocument();
  });

  test("shows disconnected state when serial console is not connected", () => {
    const disconnectedContext = {
      ...mockContextValue,
      serialConnected: false,
      serialConsole: {
        ...mockSerialConsole,
        isConnected: false,
      },
    };

    render(
      <AppStateContext.Provider value={disconnectedContext}>
        <DebugConsolePage />
      </AppStateContext.Provider>,
    );

    expect(screen.getByText("Console disconnected")).toBeInTheDocument();
  });
});
