/**
 * 接続したデバイスに応じてキーマッププロファイルを自動で選ぶための紐づけ。
 *
 * jisaku_1 と aerogu34 の 2 台を使い分けているため、接続のたびに
 * どのプロファイルを選んだかを思い出すのは手間。デバイスキーごとに
 * プロファイルを覚えておき、自動適用フラグが立っていればそのまま適用、
 * 立っていなければ「このプロファイルを適用しますか？」と提案する。
 */
import type { KeymapProfile } from "./keymapProfile";

export const DEVICE_PROFILE_BINDINGS_KEY =
  "dya-studio-device-profile-bindings";

export interface DeviceProfileBinding {
  /** deviceKeyFor() で作った安定キー */
  deviceKey: string;
  /** 表示用のデバイス名 */
  deviceLabel?: string;
  /** KeymapProfile.name */
  profileName: string;
  /** true なら接続時に自動適用、false なら提案のみ */
  autoApply: boolean;
  updatedAt: string;
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isBinding(value: unknown): value is DeviceProfileBinding {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<DeviceProfileBinding>;
  return (
    typeof candidate.deviceKey === "string" &&
    typeof candidate.profileName === "string" &&
    typeof candidate.autoApply === "boolean"
  );
}

/**
 * デバイスを識別するキーを作る。
 * シリアル番号が取れればそれを優先し、無ければデバイス名を正規化して使う。
 */
export function deviceKeyFor(info: {
  name?: string | null;
  serialNumber?: string | null;
}): string {
  const serial = info.serialNumber?.trim();
  if (serial) return `serial:${serial}`;
  const name = info.name?.trim().toLowerCase().replace(/\s+/g, "-");
  return name ? `name:${name}` : "unknown";
}

export function listDeviceProfileBindings(
  storage: StorageLike,
): DeviceProfileBinding[] {
  try {
    const raw = storage.getItem(DEVICE_PROFILE_BINDINGS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isBinding);
  } catch {
    return [];
  }
}

export function getDeviceProfileBinding(
  storage: StorageLike,
  deviceKey: string,
): DeviceProfileBinding | undefined {
  return listDeviceProfileBindings(storage).find(
    (binding) => binding.deviceKey === deviceKey,
  );
}

export function setDeviceProfileBinding(
  storage: StorageLike,
  input: {
    deviceKey: string;
    deviceLabel?: string;
    profileName: string;
    autoApply: boolean;
  },
  now: Date = new Date(),
): DeviceProfileBinding[] {
  const next = listDeviceProfileBindings(storage).filter(
    (binding) => binding.deviceKey !== input.deviceKey,
  );
  next.unshift({
    deviceKey: input.deviceKey,
    deviceLabel: input.deviceLabel,
    profileName: input.profileName,
    autoApply: input.autoApply,
    updatedAt: now.toISOString(),
  });
  try {
    storage.setItem(DEVICE_PROFILE_BINDINGS_KEY, JSON.stringify(next));
  } catch {
    // 保存できない場合は今回の接続限りの扱いになる。
  }
  return next;
}

export function removeDeviceProfileBinding(
  storage: StorageLike,
  deviceKey: string,
): DeviceProfileBinding[] {
  const next = listDeviceProfileBindings(storage).filter(
    (binding) => binding.deviceKey !== deviceKey,
  );
  try {
    storage.setItem(DEVICE_PROFILE_BINDINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
  return next;
}

export type AutoProfileStatus =
  | "auto-apply"
  | "suggest"
  | "missing-profile"
  | "none";

export interface AutoProfileResolution {
  status: AutoProfileStatus;
  binding?: DeviceProfileBinding;
  profile?: KeymapProfile;
}

/**
 * 接続直後に呼んで、このデバイスに紐づいたプロファイルを解決する。
 * - auto-apply: そのまま buildApplyPlan に渡して適用してよい
 * - suggest: ユーザーに確認してから適用する
 * - missing-profile: 紐づけはあるがプロファイルが削除されている
 */
export function resolveAutoProfile(
  storage: StorageLike,
  deviceKey: string,
  profiles: readonly KeymapProfile[],
): AutoProfileResolution {
  const binding = getDeviceProfileBinding(storage, deviceKey);
  if (!binding) return { status: "none" };
  const profile = profiles.find((entry) => entry.name === binding.profileName);
  if (!profile) return { status: "missing-profile", binding };
  return {
    status: binding.autoApply ? "auto-apply" : "suggest",
    binding,
    profile,
  };
}
