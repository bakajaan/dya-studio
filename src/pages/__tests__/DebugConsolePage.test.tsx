import { render, screen } from "@testing-library/react";
import { DebugConsolePage } from "../DebugConsolePage";
import { SerialConsoleContext } from "../../contexts/SerialConsoleContextDef";

// Mock the SerialConsole component
jest.mock("../../components/SerialConsole", () => ({
  SerialConsole: ({ onConnectionChange }: { onConnectionChange?: (connected: boolean) => void }) => {
    return <div data-testid="serial-console">Serial Console Component</div>;
  },
}));

describe("DebugConsolePage", () => {
  const mockShowAsWindow = jest.fn();
  const mockShowInTab = jest.fn();
  const mockHide = jest.fn();
  const mockSetConnectionState = jest.fn();

  const mockContextValue = {
    position: "tab" as const,
    hasActiveConnection: false,
    showAsWindow: mockShowAsWindow,
    showInTab: mockShowInTab,
    hide: mockHide,
    setConnectionState: mockSetConnectionState,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("renders page header", () => {
    render(
      <SerialConsoleContext.Provider value={mockContextValue}>
        <DebugConsolePage />
      </SerialConsoleContext.Provider>,
    );

    expect(screen.getByText("Debug Console")).toBeInTheDocument();
    expect(
      screen.getByText(/Connect to serial port for debugging/i),
    ).toBeInTheDocument();
  });

  test("renders SerialConsole component", () => {
    render(
      <SerialConsoleContext.Provider value={mockContextValue}>
        <DebugConsolePage />
      </SerialConsoleContext.Provider>,
    );

    expect(screen.getByTestId("serial-console")).toBeInTheDocument();
  });

  test("renders info box with tip", () => {
    render(
      <SerialConsoleContext.Provider value={mockContextValue}>
        <DebugConsolePage />
      </SerialConsoleContext.Provider>,
    );

    expect(screen.getByText(/Tip:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/regex-based filtering and sed-style word replacement/i),
    ).toBeInTheDocument();
  });

  test("moves console to tab when page is active with window position", () => {
    const contextWithWindow = {
      ...mockContextValue,
      position: "window" as const,
      hasActiveConnection: true,
    };

    render(
      <SerialConsoleContext.Provider value={contextWithWindow}>
        <DebugConsolePage />
      </SerialConsoleContext.Provider>,
    );

    // The effect should call showInTab when position is window and has active connection
    expect(mockShowInTab).toHaveBeenCalled();
  });
});
