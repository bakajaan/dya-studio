// Shared helpers for the dya2 per-tab e2e specs (the fan-out target).
//
// Every dya2 tab spec starts the same way: install the WebSerial shim (backed
// by the WS bridge -> the dya2 DUT's emulated USB CDC in Renode), open the app,
// reach the fully-connected screen (header shows the DUT name, default "DYA2"),
// and then drive its tab. `connectDya2(page)` does exactly that so a tab spec
// can `await connectDya2(page)` and then drive its tab.
//
// Two dya2-specific facts baked into this harness (learned during the fan-out):
//
//   1. AUTO-RECONNECT (no click). The WebSerial shim's
//      `navigator.serial.getPorts()` always returns the paired port, so
//      dya-studio's page-load auto-reconnect connects to the DUT WITHOUT any
//      user gesture — the "Connect via USB" splash button is gone before a test
//      could click it. Worse, if a spec ALSO clicks "Connect via USB" while
//      auto-reconnect is connecting, the shared serial port is opened twice and
//      the RPC framing desyncs, so every request after GetDeviceInfo silently
//      stalls (this is what left the Subsystems tab with an EMPTY list).
//      `connectDya2` therefore PREFERS the auto-reconnect path and only clicks
//      as a fallback.
//
//   2. ONE Studio connection per Renode boot. The dya2 two-machine
//      (wired-split) DUT serves only ONE Studio connection per boot; a second
//      connect desyncs on buffered bytes ("device did not respond"). So each
//      dya2 spec must run in its OWN Renode boot — do NOT combine
//      tests/common/connect.spec.ts with a tests/dya2/*.spec.ts in a single
//      boot, and do NOT pass multiple dya2 specs to one run-local.sh call.
//
// Per-boot local recipe (run EACH spec in its own boot; a wave-2 tab spec uses
// exactly this, swapping only the trailing spec path):
//   cd e2e/renode
//   ZMK_WC_RENODE_LIB=/path/to/zmk-west-commands/scripts/lib/renode \
//   DEVICE_NAME=DYA2 RENODE_PLATFORM=dya2 \
//   DYA2_PERIPHERAL_ELF=/path/to/build/left/zephyr/zmk.elf \
//     bash run-local.sh \
//       /path/to/build/right_trackball_studio_unlocked/zephyr/zmk.elf \
//       tests/dya2/<your-spec>.spec.ts
//
// RENODE_PLATFORM=dya2 makes renode_serve.py boot the combined USB+PMW3610
// two-machine wired-split platform, so the Trackball tab can exercise real
// pointer motion (inject via the monitor on the central machine:
// `sysbus.dya2_right.spi0.trackball QueueMotion <dx> <dy>`). The DUT's CDC only
// wires after ~90-130s, so run-local waits up to 320s when a peripheral ELF is
// given — expect each boot to take ~2-3 min.
import { Page, expect } from "@playwright/test";
import { serialShimSource } from "../../serial-shim.mjs";

const WS_URL = process.env.WS_URL || "ws://127.0.0.1:8788";
export const DYA2_DEVICE_NAME = process.env.DEVICE_NAME || "DYA2";

/** Install the shim + UX pre-accepts, open the app, and reach the fully
 *  connected screen — tolerating dya-studio's page-load auto-reconnect (which
 *  connects with no click) as well as the manual "Connect via USB" path.
 *  Resolves once the connected layout (header device name) is up. See fact (1)
 *  above for why this PREFERS auto-reconnect and only clicks as a fallback. */
export async function connectDya2(page: Page): Promise<void> {
  await page.addInitScript(serialShimSource(WS_URL));
  await page.addInitScript(() => {
    try {
      localStorage.setItem(
        "dya-studio-connection-notice-accepted-serial",
        "1.1.0",
      );
      localStorage.setItem("dya-studio-language", "en");
    } catch {
      /* ignore */
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const header = page.locator("header").getByText(DYA2_DEVICE_NAME);
  const usbButton = page.getByRole("button", { name: /Connect via USB/i });

  // IMPORTANT: dya-studio auto-reconnects on load (the shim always reports a
  // paired port), so PREFER that path and do NOT click — clicking "Connect via
  // USB" while auto-reconnect is also connecting opens the shared serial port
  // twice, desyncing the RPC framing so every request after GetDeviceInfo
  // silently stalls. Only fall back to a manual click if auto-reconnect fails
  // to reach the connected header.
  try {
    await expect(header).toBeVisible({ timeout: 60_000 });
  } catch {
    if (await usbButton.isVisible().catch(() => false)) {
      await usbButton.click({ force: true });
    }
    await expect(header).toBeVisible({ timeout: 120_000 });
  }
}
