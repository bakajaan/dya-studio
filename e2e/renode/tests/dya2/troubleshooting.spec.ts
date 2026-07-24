import { test, expect, type Page, type Locator } from "@playwright/test";
import { connectDya2 } from "./dya2.helpers";

// The dya2 (main+dya) Troubleshooting tab is a read-only diagnostics dashboard
// (src/pages/TroubleshootingPage.tsx) that fans out one custom Studio-RPC per
// section over the emulated USB CDC:
//   - Device Info      -> zmk__device_info   (getDeviceInfo)
//   - Watchdog         -> cormoran__watchdog (getStatus + listIncidents)
//   - Trackball sensor -> cormoran__pmw3610  (getInfo)
//   - Stack Usage      -> cormoran__devtool  (getStackUsage)  [when present]
//
// This spec proves the diagnostic read paths render REAL firmware data end-to-
// end: each section auto-fetches on mount, and expanding it paints the fetched
// values. It is strictly read-only — no device writes, no deletes.
//
// This dya2 build ships 14 custom subsystems but NOT kscan-diagnostics, so the
// KScan section (which would render a "not available" notice) is intentionally
// left untouched. The devtool Stack Usage section is asserted only if the
// firmware actually advertises the devtool subsystem (surfaced by the app's
// floating "Debug Tool" button).

// A collapsible SectionCard header is a role="button" whose accessible name is
// its title (aria-label). Clicking it toggles the section open.
function sectionHeader(page: Page, title: string): Locator {
  return page.getByRole("button", { name: title, exact: true });
}

async function expandSection(page: Page, title: string): Promise<void> {
  const header = sectionHeader(page, title);
  await expect(header).toBeVisible({ timeout: 60_000 });
  await header.click();
}

test("dya2 Troubleshooting tab: renders real diagnostics for device-info, watchdog and pmw3610", async ({
  page,
}) => {
  // The two-machine wired-split emulation is slow, and opening the tab fans out
  // several diagnostic RPCs over the single USB CDC connection; be generous.
  test.setTimeout(360_000);
  if (process.env.E2E_DEBUG) {
    page.on("console", (m) => console.log(`PAGE [${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => console.log("PAGE ERROR " + e.message));
  }
  page.on("dialog", (d) => void d.accept());

  await connectDya2(page);

  // Open the Troubleshooting tab; its header mounts (and the section hooks begin
  // auto-fetching their data over the emulated USB CDC).
  await page.getByRole("tab", { name: "Troubleshooting" }).click();
  await expect(
    page.getByRole("heading", { name: "Troubleshooting" }),
  ).toBeVisible({ timeout: 60_000 });

  // 1) DEVICE INFO (zmk__device_info): expand and assert the Build details the
  //    firmware reported are painted — the labels only render once info.build
  //    arrived, so their presence proves getDeviceInfo round-tripped.
  await expandSection(page, "Device Info");
  await expect(page.getByText("ZMK Version", { exact: true })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText("Zephyr Version", { exact: true })).toBeVisible();
  await expect(page.getByText("Board", { exact: true })).toBeVisible();
  // The summary badge ("OK" or "N devices not ready") only renders once info
  // loaded — an extra proof the section shows real device state.
  const deviceInfoCard = page
    .locator(".glass-card")
    .filter({ hasText: "Device Info" });
  await expect(
    deviceInfoCard.getByText(/^OK$|devices not ready/),
  ).toBeVisible();

  // 2) WATCHDOG (cormoran__watchdog): expand and assert the status counters the
  //    firmware reported are painted (rendered only once getStatus returned).
  //    The counter labels carry a trailing colon ("Capacity:"), so assert via
  //    the scoped card with substring matches.
  await expandSection(page, "Stability (Watchdog)");
  const watchdogCard = page
    .locator(".glass-card")
    .filter({ hasText: "Stability (Watchdog)" });
  await expect(watchdogCard).toContainText("Capacity", { timeout: 120_000 });
  await expect(watchdogCard).toContainText("Stored");
  await expect(watchdogCard).toContainText("Dropped since boot");

  // 3) PMW3610 (cormoran__pmw3610): expand and assert the sensor identity the
  //    firmware reported is painted (rendered only once getInfo returned a
  //    device). The central (right_trackball) carries the sensor.
  await expandSection(page, "Trackball Sensor (PMW3610)");
  const pmw3610Card = page
    .locator(".glass-card")
    .filter({ hasText: "Trackball Sensor (PMW3610)" });
  await expect(pmw3610Card).toContainText("Product ID", { timeout: 120_000 });
  await expect(pmw3610Card).toContainText("Revision");
  await expect(pmw3610Card).toContainText("Init error");

  // 4) DEVTOOL Stack Usage (cormoran__devtool): the section title always renders;
  //    assert it is present. If the firmware advertises the devtool subsystem
  //    (the app then shows a floating "Debug Tool" button), also assert the
  //    section's available UI (the auto-refresh control) renders.
  await expect(sectionHeader(page, "Stack Usage")).toBeVisible();
  const devtoolAvailable = await page
    .getByRole("button", { name: "Debug Tool" })
    .isVisible()
    .catch(() => false);
  if (devtoolAvailable) {
    await expandSection(page, "Stack Usage");
    await expect(page.getByText("Auto-refresh", { exact: true })).toBeVisible({
      timeout: 60_000,
    });
  }
});
