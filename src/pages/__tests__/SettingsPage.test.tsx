import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsPage } from "../SettingsPage";
import { useSettings } from "../../hooks/useSettings";
import { useCustomSettings } from "../../hooks/useCustomSettings";
import { useKeymap } from "../../hooks/useKeymap";
import type { Setting } from "../../proto/cormoran/zmk/custom_settings/custom_settings";

jest.mock("../../hooks/useSettings");
jest.mock("../../hooks/useKeymap");
jest.mock("../../hooks/useCustomSettings", () => ({
  CUSTOM_SETTINGS_SOURCE_ALL: 0xffffffff,
  useCustomSettings: jest.fn(),
}));

const mockUseSettings = useSettings as jest.MockedFunction<typeof useSettings>;
const mockUseCustomSettings = useCustomSettings as jest.MockedFunction<
  typeof useCustomSettings
>;
const mockUseKeymap = useKeymap as jest.MockedFunction<typeof useKeymap>;

const customSettings: Setting[] = [
  {
    customSubsystemIndex: 4,
    key: "speed",
    source: 0,
    hasUnsavedValue: false,
    value: { int32Value: 35 },
    meta: {
      confidentiality: 2,
      readPermission: 0,
      writePermission: 0,
      constraints: [
        {
          range: {
            min: { int32Value: 0 },
            max: { int32Value: 100 },
          },
        },
      ],
    },
  },
  {
    customSubsystemIndex: 4,
    key: "speed",
    source: 1,
    hasUnsavedValue: false,
    value: { int32Value: 45 },
    meta: {
      confidentiality: 2,
      readPermission: 0,
      writePermission: 0,
      constraints: [
        {
          range: {
            min: { int32Value: 0 },
            max: { int32Value: 100 },
          },
        },
      ],
    },
  },
];

describe("SettingsPage", () => {
  const updateSettingMemory = jest.fn();
  const saveSubsystemSettings = jest.fn();
  const discardSubsystemSettings = jest.fn();
  const resetSubsystemSettings = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    updateSettingMemory.mockResolvedValue(undefined);
    saveSubsystemSettings.mockResolvedValue(undefined);
    discardSubsystemSettings.mockResolvedValue(undefined);
    resetSubsystemSettings.mockResolvedValue(undefined);

    mockUseSettings.mockReturnValue({
      isAvailable: true,
      devices: [
        { sourceId: 0, deviceName: "Central", idleMs: 30000, sleepMs: 900000 },
      ],
      isLoading: false,
      error: null,
      loadAllSettings: jest.fn(),
      setActivitySettings: jest.fn(),
      resetToDefaults: jest.fn(),
    });

    mockUseCustomSettings.mockReturnValue({
      isAvailable: true,
      settings: customSettings,
      isLoading: false,
      error: null,
      loadSettings: jest.fn(),
      updateSettingMemory,
      saveSubsystemSettings,
      discardSubsystemSettings,
      resetSubsystemSettings,
      subsystemIdentifierForIndex: (index) =>
        index === 4 ? "zmk_config_sample" : `${index}`,
    });

    mockUseKeymap.mockReturnValue({
      keymap: {
        layers: [
          { id: 0, name: "Base", bindings: [] },
          { id: 1, name: "Lower", bindings: [] },
        ],
        availableLayers: 2,
      },
      physicalLayouts: null,
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
      availableLayers: 2,
      removedLayerIds: [],
      saveChanges: jest.fn(),
      discardChanges: jest.fn(),
      setActiveLayout: jest.fn(),
      getOriginalBinding: jest.fn(),
      isBindingModified: jest.fn(),
      getBehavior: jest.fn(),
      getBindingDisplayName: jest.fn(),
      clearUnlockRequired: jest.fn(),
    });
  });

  it("shows custom settings after power management", () => {
    render(<SettingsPage />);

    const powerHeading = screen.getByText("Power Management");
    const customHeading = screen.getByText("Custom Settings");

    expect(
      powerHeading.compareDocumentPosition(customHeading) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText("zmk_config_sample")).toBeInTheDocument();
    expect(screen.getAllByText("Central").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Peripheral 1").length).toBeGreaterThan(0);
  });

  it("updates custom settings memory with selectable split target", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    const targetSelect = screen.getByLabelText("Target");
    expect(targetSelect).toHaveTextContent("All");
    expect(targetSelect).toHaveTextContent("Central");
    expect(targetSelect).toHaveTextContent("Peripheral 1");

    const valueInput = screen.getByLabelText("Value");
    expect(valueInput).toHaveAttribute("min", "0");
    expect(valueInput).toHaveAttribute("max", "100");

    await user.clear(valueInput);
    await user.type(valueInput, "42");

    await waitFor(() =>
      expect(updateSettingMemory).toHaveBeenCalledWith(
        customSettings[0],
        { int32Value: 42 },
        0xffffffff,
      ),
    );
  });

  it("enables subsystem save and discard when a custom setting is pending", async () => {
    const user = userEvent.setup();
    mockUseCustomSettings.mockReturnValue({
      isAvailable: true,
      settings: [{ ...customSettings[0], hasUnsavedValue: true }],
      isLoading: false,
      error: null,
      loadSettings: jest.fn(),
      updateSettingMemory,
      saveSubsystemSettings,
      discardSubsystemSettings,
      resetSubsystemSettings,
      subsystemIdentifierForIndex: (index) =>
        index === 4 ? "zmk_config_sample" : `${index}`,
    });

    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(saveSubsystemSettings).toHaveBeenCalledWith(4);

    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(discardSubsystemSettings).toHaveBeenCalledWith(4);
    expect(screen.getAllByText("pending").length).toBeGreaterThan(0);
  });

  it("confirms reset before resetting subsystem settings", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(resetSubsystemSettings).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm Reset" }));
    expect(resetSubsystemSettings).toHaveBeenCalledWith(4);
  });

  it("shows custom settings even when the power settings subsystem is absent", () => {
    mockUseSettings.mockReturnValue({
      isAvailable: false,
      devices: [],
      isLoading: false,
      error: null,
      loadAllSettings: jest.fn(),
      setActivitySettings: jest.fn(),
      resetToDefaults: jest.fn(),
    });

    render(<SettingsPage />);

    expect(screen.queryByText("Power Management")).not.toBeInTheDocument();
    expect(screen.getByText("Custom Settings")).toBeInTheDocument();
  });
});
