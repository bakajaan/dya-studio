import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ZMKAppContext } from "@cormoran/zmk-studio-react-hook";
import { useCustomSettings } from "../useCustomSettings";
import {
  Notification,
  Response,
  SettingNotificationKind,
} from "../../proto/cormoran/zmk/custom_settings/custom_settings";

const mockCallRPC = jest.fn();
const mockOnNotification = jest.fn();

jest.mock("@cormoran/zmk-studio-react-hook", () => ({
  ...jest.requireActual("@cormoran/zmk-studio-react-hook"),
  ZMKCustomSubsystem: jest.fn().mockImplementation(() => ({
    callRPC: mockCallRPC,
  })),
}));

function createWrapper(zmkAppValue: {
  state: {
    connection: unknown;
    customSubsystems: unknown[];
  };
  findSubsystem: (id: string) => { index: number; identifier: string } | null;
  onNotification: (subscription: unknown) => () => void;
}) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ZMKAppContext.Provider value={zmkAppValue as never}>
        {children}
      </ZMKAppContext.Provider>
    );
  };
}

function listItemNotification({
  key,
  source,
  value,
}: {
  key: string;
  source: number;
  value: number;
}) {
  return {
    payload: Notification.encode(
      Notification.create({
        setting: {
          kind: SettingNotificationKind.SETTING_NOTIFICATION_KIND_LIST_ITEM,
          setting: {
            customSubsystemIndex: 2,
            key,
            source,
            hasUnsavedValue: false,
            value: { int32Value: value },
          },
        },
      }),
    ).finish(),
  };
}

describe("useCustomSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("waits for quiet notifications before finishing an all-source list", async () => {
    const response = Response.create({
      status: { affectedCount: 1, message: "OK" },
    });
    mockCallRPC.mockResolvedValue(Response.encode(response).finish());

    let notificationCallback:
      | ((notification: { payload: Uint8Array }) => void)
      | null = null;
    mockOnNotification.mockImplementation(
      (subscription: {
        callback: (notification: { payload: Uint8Array }) => void;
      }) => {
        notificationCallback = subscription.callback;
        return () => {};
      },
    );

    const wrapper = createWrapper({
      state: {
        connection: { isConnected: true },
        customSubsystems: [
          { index: 0, identifier: "cormoran_custom_settings" },
        ],
      },
      findSubsystem: (id: string) =>
        id === "cormoran_custom_settings"
          ? { index: 0, identifier: "cormoran_custom_settings" }
          : null,
      onNotification: mockOnNotification,
    });

    const { result } = renderHook(() => useCustomSettings(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockCallRPC).toHaveBeenCalledTimes(1);
    expect(notificationCallback).not.toBeNull();

    await act(async () => {
      notificationCallback?.(
        listItemNotification({ key: "feature/value", source: 0, value: 10 }),
      );
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.settings).toHaveLength(0);

    await act(async () => {
      notificationCallback?.(
        listItemNotification({ key: "feature/value", source: 1, value: 20 }),
      );
      jest.advanceTimersByTime(1499);
    });

    expect(result.current.settings).toHaveLength(0);

    await act(async () => {
      jest.advanceTimersByTime(1);
    });

    expect(result.current.settings.map((setting) => setting.source)).toEqual([
      0, 1,
    ]);
  });
});
