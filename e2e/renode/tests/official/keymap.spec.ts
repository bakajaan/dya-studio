import { test, expect, type Page } from "@playwright/test";
import { serialShimSource } from "../../serial-shim.mjs";

const WS_URL = process.env.WS_URL || "ws://127.0.0.1:8788";

// Name the DUT firmware advertises via GetDeviceInfo. The default DUT is
// zmk-west-commands' real studio-rpc-usb-uart image (renode_tester shield → name
// "Renode"); override for a real dya build.
const DEVICE_NAME = process.env.DEVICE_NAME || "Renode";

// The renode_tester shield ships a single-layer 2x2 keymap:
//   &kp A  &kp B
//   &kp C  &kp D
// so the keymap grid renders the four key labels A / B / C / D (positions 0..3).
const RENODE_TESTER_KEYS = ["A", "B", "C", "D"];
// A keycode NOT already in the default keymap, so its appearance in the grid is
// an unambiguous proof that our edit took effect (and round-tripped).
const NEW_KEYCODE = "F";

// Reproduce the exact connect flow proven by tests/connect.spec.ts: install the
// navigator.serial shim (backed by the WS bridge -> the DUT's emulated USB CDC in
// Renode), pre-accept the notice + force English, reduce motion, click the real
// "Connect via USB" button, and wait until the app reaches the fully-connected
// screen (the device's own name in the header).
async function connect(page: Page) {
  const logs: string[] = [];
  page.on("console", (m) => {
    const line = `[${m.type()}] ${m.text()}`;
    logs.push(line);
    if (process.env.E2E_DEBUG) console.log("PAGE " + line);
  });
  page.on("pageerror", (e) => {
    if (process.env.E2E_DEBUG) console.log("PAGE ERROR " + e.message);
  });

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

  // Full connect handshake done: the header shows the device's own name and the
  // splash button is gone.
  await expect(page.locator("header").getByText(DEVICE_NAME)).toBeVisible({
    timeout: 60_000,
  });
  await expect(usbButton).toBeHidden();
}

// A key in the on-screen physical-keymap grid renders its binding's short label
// (for `&kp A` that's just "A") in a span. Match that label exactly.
function keyLabel(page: Page, label: string) {
  return page.getByText(label, { exact: true });
}

test("dya-studio Keymap tab: renders the keymap + behaviors and round-trips a binding edit against official ZMK in Renode", async ({
  page,
}) => {
  test.setTimeout(180_000);

  // 1) Connect to the real (official, unlocked) firmware in Renode.
  await connect(page);

  // 2) Navigate to the Keymap tab.
  await page.getByRole("tab", { name: "Keymap" }).click();

  // 3) The keymap RENDERS: the layer's four key bindings (A/B/C/D) are painted
  //    into the grid. This is a real keymap.* + behaviors.* RPC round-trip
  //    (core Studio protocol — works on official ZMK).
  for (const k of RENODE_TESTER_KEYS) {
    await expect(keyLabel(page, k).first()).toBeVisible({ timeout: 60_000 });
  }
  // The new keycode is NOT present yet (baseline for the edit assertion below).
  await expect(keyLabel(page, NEW_KEYCODE)).toHaveCount(0);

  // 4) Exercise behaviors: open the binding editor for the first key (A).
  await keyLabel(page, "A").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Select Key Binding")).toBeVisible();

  // The behavior PICKER is populated from the device (behaviors.* RPC): the
  // opened key's behavior (Key Press) is pre-selected, and the quick-select row
  // offers core behaviors (e.g. None).
  await expect(dialog.getByText("Key Press").first()).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "None", exact: true }),
  ).toBeVisible();

  // Open the full behavior dropdown and assert it lists core ZMK behaviors that
  // are NOT quick-selects — proving the whole behavior list came back from the
  // firmware, not just the hard-coded quick-select set.
  await dialog
    .getByRole("button", { name: /Key Press/ })
    .first()
    .click();
  await expect(
    dialog.getByRole("button", { name: "Momentary Layer" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Toggle Layer" }),
  ).toBeVisible();
  // Close the dropdown (toggle the trigger) to return to the keycode editor.
  await dialog
    .getByRole("button", { name: /Key Press/ })
    .first()
    .click();

  // 5) CHANGE the binding: reassign key A to `&kp F` via the keycode grid.
  //    "Close on select" (default on) applies the pick and closes the dialog.
  await expect(dialog.getByPlaceholder("Search keycodes...")).toBeVisible();
  await dialog.getByRole("button", { name: NEW_KEYCODE, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // The edit is reflected in the UI (unsaved), and the new keycode now paints
  // into the grid where A used to be.
  await expect(keyLabel(page, NEW_KEYCODE).first()).toBeVisible();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();

  // 6) SAVE to the device (keymap.* set/save RPC over the emulated USB CDC).
  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  // Save cleared the unsaved state: the status flips to "Saved" and Save disables.
  await expect(page.getByText("Saved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(saveButton).toBeDisabled();

  // 7) ROUND-TRIP: leave the Keymap tab and come back. KeymapPage unmounts on
  //    tab switch, so returning re-reads the keymap from the device — proving
  //    the change was persisted to the firmware and read back (not just held in
  //    the browser). The new keycode must still be there, and the four original
  //    (minus the edited A) plus F must be consistent.
  await page.getByRole("tab", { name: "Home" }).click();
  await page.getByRole("tab", { name: "Keymap" }).click();

  await expect(keyLabel(page, NEW_KEYCODE).first()).toBeVisible({
    timeout: 60_000,
  });
  // B / C / D are untouched; and A is gone (it became F).
  for (const k of ["B", "C", "D"]) {
    await expect(keyLabel(page, k).first()).toBeVisible();
  }
  await expect(keyLabel(page, "A")).toHaveCount(0);
});
