import { test, expect, type Page } from "@playwright/test";
import { connectDya2 } from "./dya2.helpers";

// Subsystems tab (src/pages/CustomSubsystemsPage.tsx) — enumerates the device's
// custom Studio-RPC subsystems from ZMKAppContext.state.customSubsystems (the
// firmware's ListCustomSubsystem reply). Each subsystem renders a card showing
// its raw identifier (e.g. "cormoran__pmw3610") in a `<p class="font-mono
// break-all">`, split into "supported by DYA Studio" vs unsupported sections.
//
// This spec proves the fork's custom-RPC subsystem ENUMERATION works end-to-end
// on the real dya2 firmware in Renode: the app fetched the subsystem list over
// the emulated USB CDC and painted a populated list. Read-only: no device
// writes.

// A meaningful subset of the identifiers the dya2 (main+dya) central actually
// advertises — each a distinct fork custom-RPC subsystem, all CONFIRMED against
// the live DUT dump (E2E_DEBUG "subsystem identifiers" log line below; the DUT
// reports 14, incl. cormoran__physical_layouts / cormoran_rip / zmk__input_stream
// / zmk__settings). We assert this curated subset (not the whole 14) so adding or
// dropping a peripheral module in the firmware doesn't spuriously fail the test,
// while still proving the real fork subsystems enumerate. NOTE: this dya2 build
// does NOT ship kscan-diagnostics, so it is intentionally absent here.
const EXPECTED_SUBSYSTEM_IDENTIFIERS = [
  "zmk__device_info", // device-info
  "cormoran__pmw3610", // pmw3610 trackball
  "cormoran_custom_settings", // custom-settings
  "cormoran__watchdog", // watchdog
  "cormoran_ble", // ble-management
  "cormoran__os_detection", // os-detection
  "cormoran__runtime_macro", // runtime-macro
  "cormoran__runtime_combo", // runtime-combo
  "cormoran__default_layer", // default-layer
  "cormoran__fast_keymap", // fast-keymap (powers the Keymap tab's fast path)
];

// The identifier of each subsystem card is the only `<p>` carrying BOTH the
// font-mono and break-all classes (URL links are spans), so this selects exactly
// the rendered subsystem identifiers.
function identifierParagraphs(page: Page) {
  return page.locator("p.font-mono.break-all");
}

test("dya-studio Subsystems tab: enumerates the real dya2 custom Studio-RPC subsystems in Renode", async ({
  page,
}) => {
  if (process.env.E2E_DEBUG) {
    page.on("console", (m) => console.log(`PAGE [${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => console.log(`PAGE ERROR ${e.message}`));
  }

  await connectDya2(page);

  // Open the Subsystems tab (radix Tabs.Trigger, role="tab").
  await page.getByRole("tab", { name: "Subsystems" }).click();

  // The page mounts: its heading is up.
  await expect(
    page.getByRole("heading", { name: "Custom Subsystems" }),
  ).toBeVisible();

  // Every subsystem the dya2 fork advertises is one DYA Studio has a dedicated
  // UI for, so they all land in the collapsible "Already supported by DYA
  // Studio" SectionCard (src/components/troubleshooting/SectionCard.tsx), which
  // is COLLAPSED by default and only renders its subsystem cards (incl. the
  // identifier <p>) once expanded. Wait for that section to appear (proves the
  // ListCustomSubsystem reply arrived and produced cards) and expand it so the
  // identifiers render.
  const supportedSection = page.getByRole("button", {
    name: "Already supported by DYA Studio",
  });
  await expect(supportedSection).toBeVisible({ timeout: 60_000 });
  await supportedSection.click();

  // The list is POPULATED: the firmware's ListCustomSubsystem reply produced
  // several subsystem cards. Wait for the enumeration to render.
  await expect
    .poll(async () => identifierParagraphs(page).count(), {
      timeout: 60_000,
      message: "dya2 custom-subsystem list never populated",
    })
    .toBeGreaterThanOrEqual(EXPECTED_SUBSYSTEM_IDENTIFIERS.length);

  // Dump the live identifiers for diagnostics / to confirm the expected set.
  const rendered = await identifierParagraphs(page).allInnerTexts();
  const trimmed = rendered.map((s) => s.trim());
  if (process.env.E2E_DEBUG) {
    console.log(
      `dya2 subsystem identifiers (${trimmed.length}): ${JSON.stringify(trimmed)}`,
    );
  }

  // The "empty" fallback copy must NOT be shown (guards against a false pass
  // where the list rendered zero cards).
  await expect(
    page.getByText("No custom subsystems available.", { exact: false }),
  ).toHaveCount(0);

  // Every expected dya2 subsystem identifier appears in the rendered list. Each
  // is a distinct fork custom-RPC subsystem enumerated over the real transport.
  for (const id of EXPECTED_SUBSYSTEM_IDENTIFIERS) {
    expect(trimmed, `expected subsystem "${id}" in rendered list`).toContain(
      id,
    );
  }
});
