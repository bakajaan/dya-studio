import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GitHubPage } from "../GitHubPage";
import { ConnectionContext } from "../../components/DeviceConnection";
import {
  ZMKAppProvider,
  createMockZMKApp,
} from "@cormoran/zmk-studio-react-hook/testing";

jest.mock("../../hooks/useGitHub");
import { useGitHub } from "../../hooks/useGitHub";
const mockUseGitHub = useGitHub as jest.MockedFunction<typeof useGitHub>;

jest.mock("../../hooks/useKeymap");
import { useKeymap } from "../../hooks/useKeymap";
const mockUseKeymap = useKeymap as jest.MockedFunction<typeof useKeymap>;

const mockConnectionContext = {
  isConnected: true,
  deviceName: "DYA Keyboard",
  onConnect: jest.fn(),
  onDisconnect: jest.fn(),
  isLoading: false,
  error: null,
};

const demoConnectionContext = {
  ...mockConnectionContext,
  deviceName: "DYA Keyboard (Demo)",
};

const baseGitHubState = {
  token: null,
  user: null,
  repos: [],
  selectedRepo: null,
  keymapFiles: [],
  selectedFile: null,
  originalContent: null,
  patchedContent: null,
  diff: [],
  isLoading: false,
  error: null,
  isDemo: false,
  login: jest.fn(),
  logout: jest.fn(),
  selectRepo: jest.fn(),
  selectFile: jest.fn(),
  commitChanges: jest.fn(),
  updateDiff: jest.fn(),
};

const baseKeymapState = {
  physicalLayouts: null,
  keymap: null,
  behaviors: new Map(),
  originalBindings: new Map(),
  hasUnsavedChanges: false,
  isLoading: false,
  error: null,
  unlockRequired: false,
  loadKeymapData: jest.fn(),
  setBinding: jest.fn(),
  resetBinding: jest.fn(),
  moveLayer: jest.fn(),
  addLayer: jest.fn(),
  removeLayer: jest.fn(),
  restoreLayer: jest.fn(),
  availableLayers: 4,
  removedLayerIds: [],
  saveChanges: jest.fn(),
  discardChanges: jest.fn(),
  setActiveLayout: jest.fn(),
  getOriginalBinding: jest.fn(),
  isBindingModified: jest.fn(),
  getBehavior: jest.fn(),
  getBindingDisplayName: jest.fn(),
  clearUnlockRequired: jest.fn(),
};

describe("GitHubPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGitHub.mockReturnValue({ ...baseGitHubState });
    mockUseKeymap.mockReturnValue({ ...baseKeymapState });
  });

  const renderComponent = (connectionOverrides = {}, githubOverrides = {}) => {
    const connectionContext = {
      ...mockConnectionContext,
      ...connectionOverrides,
    };
    mockUseGitHub.mockReturnValue({ ...baseGitHubState, ...githubOverrides });
    const mockZMKApp = createMockZMKApp();

    return render(
      <ConnectionContext.Provider value={connectionContext}>
        <ZMKAppProvider value={mockZMKApp}>
          <GitHubPage />
        </ZMKAppProvider>
      </ConnectionContext.Provider>,
    );
  };

  it("renders header correctly", () => {
    renderComponent();
    expect(screen.getByText("GitHub Keymap Sync")).toBeInTheDocument();
    expect(
      screen.getByText("Sync your keymap configuration to GitHub"),
    ).toBeInTheDocument();
  });

  it("shows demo mode banner in demo mode", () => {
    renderComponent(
      { deviceName: demoConnectionContext.deviceName },
      { isDemo: true },
    );
    expect(screen.getByText("Demo Mode")).toBeInTheDocument();
    expect(
      screen.getByText(/GitHub login is disabled in demo mode/),
    ).toBeInTheDocument();
  });

  it("shows login button when not logged in and not demo", () => {
    renderComponent({}, { token: null, user: null, isDemo: false });
    expect(
      screen.getByRole("button", { name: /Login with GitHub/i }),
    ).toBeInTheDocument();
  });

  it("shows user info when logged in", () => {
    renderComponent(
      {},
      {
        token: "test-token",
        user: {
          login: "testuser",
          name: "Test User",
          avatar_url: "https://example.com/avatar.png",
        },
      },
    );
    expect(screen.getByText("Test User")).toBeInTheDocument();
    expect(screen.getByText("@testuser")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Logout/i })).toBeInTheDocument();
  });

  it("shows repo list when repos are available", () => {
    renderComponent(
      {},
      {
        token: "test-token",
        user: { login: "testuser", name: "Test User", avatar_url: "" },
        repos: [
          {
            id: 1,
            name: "zmk-config",
            full_name: "testuser/zmk-config",
            private: false,
            default_branch: "main",
            html_url: "https://github.com/testuser/zmk-config",
          },
          {
            id: 2,
            name: "zmk-private",
            full_name: "testuser/zmk-private",
            private: true,
            default_branch: "main",
            html_url: "https://github.com/testuser/zmk-private",
          },
        ],
      },
    );
    expect(screen.getByText("zmk-config")).toBeInTheDocument();
    expect(screen.getByText("zmk-private")).toBeInTheDocument();
  });

  it("shows keymap file list when repo is selected and files are loaded", () => {
    renderComponent(
      {},
      {
        token: "test-token",
        user: { login: "testuser", name: "Test User", avatar_url: "" },
        repos: [
          {
            id: 1,
            name: "zmk-config",
            full_name: "testuser/zmk-config",
            private: false,
            default_branch: "main",
            html_url: "",
          },
        ],
        selectedRepo: {
          id: 1,
          name: "zmk-config",
          full_name: "testuser/zmk-config",
          private: false,
          default_branch: "main",
          html_url: "",
        },
        keymapFiles: ["config/dya.keymap"],
      },
    );
    expect(screen.getByText("config/dya.keymap")).toBeInTheDocument();
  });

  it("shows diff viewer when diff data is available", () => {
    renderComponent(
      {},
      {
        token: "test-token",
        user: { login: "testuser", name: "Test User", avatar_url: "" },
        selectedRepo: {
          id: 1,
          name: "zmk-config",
          full_name: "testuser/zmk-config",
          private: false,
          default_branch: "main",
          html_url: "",
        },
        selectedFile: "config/dya.keymap",
        originalContent: "&kp A",
        diff: [
          {
            type: "removed",
            content: "&kp A",
            lineNumber: { old: 1, new: null },
          },
          {
            type: "added",
            content: "&kp B",
            lineNumber: { old: null, new: 1 },
          },
        ],
      },
    );
    expect(screen.getByText("+1 added")).toBeInTheDocument();
    expect(screen.getByText("-1 removed")).toBeInTheDocument();
  });

  it("shows PR button when diff is available", () => {
    renderComponent(
      {},
      {
        token: "test-token",
        user: { login: "testuser", name: "Test User", avatar_url: "" },
        selectedRepo: {
          id: 1,
          name: "zmk-config",
          full_name: "testuser/zmk-config",
          private: false,
          default_branch: "main",
          html_url: "",
        },
        selectedFile: "config/dya.keymap",
        originalContent: "&kp A",
        diff: [
          {
            type: "added",
            content: "&kp B",
            lineNumber: { old: null, new: 1 },
          },
        ],
        keymapFiles: ["config/dya.keymap"],
      },
    );
    expect(
      screen.getByRole("button", { name: /Create Pull Request/i }),
    ).toBeInTheDocument();
  });

  it("calls login when login button is clicked", async () => {
    const user = userEvent.setup();
    const mockLogin = jest.fn();
    renderComponent({}, { login: mockLogin, isDemo: false });
    await user.click(
      screen.getByRole("button", { name: /Login with GitHub/i }),
    );
    expect(mockLogin).toHaveBeenCalled();
  });
});
