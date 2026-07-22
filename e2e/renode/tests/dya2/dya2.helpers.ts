// Shared helpers for the dya2 per-tab e2e specs (the fan-out target).
//
// Every dya2 tab spec starts the same way: install the WebSerial shim (backed
// by the WS bridge -> the dya2 DUT's emulated USB CDC in Renode), open the app,
// click "Connect via USB", and wait for the fully-connected screen (header shows
// the DUT name, default "DYA2"). `connectDya2(page)` does exactly that so a tab
// spec can `await connectDya2(page)` and then drive its tab.
//
// Boot/connect contract (how the harness is wired for these specs):
//   cd e2e/renode
//   ZMK_WC_RENODE_LIB=/path/to/zmk-west-commands/scripts/lib/renode \
//   DEVICE_NAME=DYA2 RENODE_PLATFORM=dya2 \
//     bash run-local.sh /path/to/dya2/.../zephyr/zmk.elf tests/common tests/dya2
//
// RENODE_PLATFORM=dya2 makes renode_serve.py boot the combined USB+PMW3610
// platform (platforms/xiao_nrf52840_usb_pmw3610.repl), so the Trackball tab can
// exercise real pointer motion (inject via the monitor: the sensor path is
// `sysbus.spi0.trackball` -- `QueueMotion <dx> <dy>`).
import { Page, expect } from "@playwright/test";
import { serialShimSource } from "../../serial-shim.mjs";

const WS_URL = process.env.WS_URL || "ws://127.0.0.1:8788";
export const DYA2_DEVICE_NAME = process.env.DEVICE_NAME || "DYA2";

/** Install the shim + UX pre-accepts, open the app, and fully connect to the
 *  dya2 DUT. Resolves once the connected layout (header device name) is up. */
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

  const usbButton = page.getByRole("button", { name: /Connect via USB/i });
  await expect(usbButton).toBeVisible();
  await usbButton.click({ force: true });

  await expect(page.locator("header").getByText(DYA2_DEVICE_NAME)).toBeVisible({
    timeout: 60_000,
  });
  await expect(usbButton).toBeHidden();
}
