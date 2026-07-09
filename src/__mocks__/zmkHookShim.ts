/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shim for @cormoran/zmk-studio-react-hook used in Jest tests.
 *
 * The installed v0.0.1 of this package is missing several exports that the
 * source code depends on.  This shim re-exports the real package contents and
 * adds stub implementations for those missing exports so all tests compile and
 * run correctly.
 *
 * Tests that need specific RPC behaviour continue to call
 *   jest.mock("@cormoran/zmk-studio-react-hook", factory)
 * and override individual exports; the factory's spread of
 *   jest.requireActual("@cormoran/zmk-studio-react-hook")
 * will resolve to this shim (all real + stub exports).
 */

import { useContext, useState } from "react";

// Re-export everything the installed package actually provides.
// Use a relative path so Jest does NOT apply the moduleNameMapper again
// (which would create a circular redirect back to this shim).
import {
  useZMKApp,
  ZMKCustomSubsystem,
  ZMKCustomSubsystemError,
  ZMKConnection,
  ZMKAppContext,
  withTimeout,
} from "../../node_modules/@cormoran/zmk-studio-react-hook/lib/index.js";

export {
  useZMKApp,
  ZMKCustomSubsystem,
  ZMKCustomSubsystemError,
  ZMKConnection,
  ZMKAppContext,
  withTimeout,
};

// ---------------------------------------------------------------------------
// Missing exports – stub implementations suitable for the test environment
// ---------------------------------------------------------------------------

/** Returns true when navigator.serial exists. */
export function isWebSerialSupported(): boolean {
  return typeof navigator !== "undefined" && "serial" in navigator;
}

/**
 * Identifies a MetaError thrown for the UNLOCK_REQUIRED condition
 * (ErrorConditions.UNLOCK_REQUIRED === 1).
 */
export function isUnlockRequiredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "condition" in error &&
    (error as unknown as { condition: number }).condition === 1
  );
}

/** Returns navigator.serial.getPorts(), or [] when the API is absent. */
export async function getPairedSerialPorts(): Promise<unknown[]> {
  const serial = (
    navigator as unknown as { serial?: { getPorts(): Promise<unknown[]> } }
  ).serial;
  if (!serial?.getPorts) return [];
  return serial.getPorts();
}

/**
 * Opens the first previously-paired serial port and returns a minimal
 * transport-like object.  The real transport stream internals are not needed
 * in tests because DeviceConnection passes it straight to useZMKApp.connect,
 * and create_rpc_connection is already mocked by setupZMKMocks.
 */
export async function connectToPairedSerial(): Promise<unknown> {
  const serial = (
    navigator as unknown as { serial?: { getPorts(): Promise<any[]> } }
  ).serial;
  if (!serial?.getPorts) return null;
  const ports = await serial.getPorts();
  if (!ports || ports.length === 0) return null;
  const port = ports[0];
  await port.open({ baudRate: 12500 });
  return {
    label: "serial",
    abortController: new AbortController(),
    readable: port.readable ?? {},
    writable: port.writable ?? {},
  };
}

/**
 * Minimal hook that looks up a subsystem by identifier from ZMKAppContext
 * and returns { subsystem, ready, call }.
 *
 * Tests that verify actual RPC behaviour override this via
 *   jest.mock("@cormoran/zmk-studio-react-hook", factory)
 * and supply a proper call mock through createUseCustomSubsystemMock.
 */
export function useCustomSubsystem(identifier: string, _codec: unknown) {
  const zmkApp = useContext(ZMKAppContext as any);
  const subsystem = zmkApp?.findSubsystem?.(identifier) ?? null;
  // Stable mock: useState lazy initializer runs only once per component mount,
  // so call never changes between renders and doesn't trigger infinite loops.
  const [call] = useState<jest.Mock>(() => jest.fn());
  return {
    subsystem,
    ready: subsystem !== null,
    call,
  };
}
