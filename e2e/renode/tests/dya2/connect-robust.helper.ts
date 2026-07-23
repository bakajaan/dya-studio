// Robust connect helper for the dya2 tab specs.
//
// Why this exists (and why the specs don't call the shared `connectDya2`):
// the WebSerial shim's `navigator.serial.getPorts()` always returns the paired
// port, so dya-studio's page-load AUTO-RECONNECT kicks in and connects to the
// DUT *without* any user gesture. That removes the "Connect via USB" splash
// button before a test can click it, so `connectDya2`'s unconditional
// `usbButton.click()` hangs for the whole test timeout (observed: it also wedges
// the DUT's Studio session for the following tests). This helper instead races
// the auto-reconnect against a manual click: whichever path connects first
// wins, and it simply waits for the connected header either way.
import { Page, expect } from "@playwright/test";
import { serialShimSource } from "../../serial-shim.mjs";

const WS_URL = process.env.WS_URL || "ws://127.0.0.1:8788";
export const DYA2_DEVICE_NAME = process.env.DEVICE_NAME || "DYA2";

/** Install the shim + UX pre-accepts, open the app, and reach the fully
 *  connected screen — tolerating dya-studio's page-load auto-reconnect (which
 *  connects with no click) as well as the manual "Connect via USB" path. */
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
