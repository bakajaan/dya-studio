import type { KeymapProfile } from "../keymapProfile";
import {
  DEVICE_PROFILE_BINDINGS_KEY,
  deviceKeyFor,
  getDeviceProfileBinding,
  listDeviceProfileBindings,
  removeDeviceProfileBinding,
  resolveAutoProfile,
  setDeviceProfileBinding,
} from "../profileAutoSwitch";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function profile(name: string): KeymapProfile {
  return {
    version: 1,
    name,
    createdAt: "2026-07-28T00:00:00.000Z",
    keyCount: 34,
    layers: [],
  };
}

const NOW = new Date("2026-07-28T11:00:00Z");

describe("profileAutoSwitch", () => {
  it("builds stable device keys", () => {
    expect(deviceKeyFor({ serialNumber: "ABC123", name: "jisaku_1" })).toBe(
      "serial:ABC123",
    );
    expect(deviceKeyFor({ name: "Aerogu 34" })).toBe("name:aerogu-34");
    expect(deviceKeyFor({})).toBe("unknown");
  });

  it("stores one binding per device", () => {
    const storage = memoryStorage();
    setDeviceProfileBinding(
      storage,
      {
        deviceKey: "name:jisaku_1",
        deviceLabel: "jisaku_1",
        profileName: "fue34",
        autoApply: true,
      },
      NOW,
    );
    setDeviceProfileBinding(
      storage,
      {
        deviceKey: "name:jisaku_1",
        profileName: "fue34-v2",
        autoApply: false,
      },
      NOW,
    );
    const bindings = listDeviceProfileBindings(storage);
    expect(bindings).toHaveLength(1);
    expect(bindings[0].profileName).toBe("fue34-v2");
    expect(getDeviceProfileBinding(storage, "name:jisaku_1")?.autoApply).toBe(
      false,
    );
  });

  it("resolves the profile to apply on connect", () => {
    const storage = memoryStorage();
    const profiles = [profile("fue34"), profile("aerogu")];

    expect(resolveAutoProfile(storage, "name:jisaku_1", profiles).status).toBe(
      "none",
    );

    setDeviceProfileBinding(
      storage,
      { deviceKey: "name:jisaku_1", profileName: "fue34", autoApply: true },
      NOW,
    );
    const auto = resolveAutoProfile(storage, "name:jisaku_1", profiles);
    expect(auto.status).toBe("auto-apply");
    expect(auto.profile?.name).toBe("fue34");

    setDeviceProfileBinding(
      storage,
      { deviceKey: "name:aerogu34", profileName: "aerogu", autoApply: false },
      NOW,
    );
    expect(resolveAutoProfile(storage, "name:aerogu34", profiles).status).toBe(
      "suggest",
    );

    setDeviceProfileBinding(
      storage,
      { deviceKey: "name:other", profileName: "deleted", autoApply: true },
      NOW,
    );
    expect(resolveAutoProfile(storage, "name:other", profiles).status).toBe(
      "missing-profile",
    );
  });

  it("removes bindings and survives corrupted data", () => {
    const storage = memoryStorage();
    setDeviceProfileBinding(
      storage,
      { deviceKey: "name:jisaku_1", profileName: "fue34", autoApply: true },
      NOW,
    );
    expect(removeDeviceProfileBinding(storage, "name:jisaku_1")).toHaveLength(0);
    storage.setItem(DEVICE_PROFILE_BINDINGS_KEY, "{broken");
    expect(listDeviceProfileBindings(storage)).toHaveLength(0);
  });
});
