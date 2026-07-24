import { test, expect } from "@playwright/test";
import { connectDya2, DYA2_DEVICE_NAME } from "./dya2.helpers";

// Home tab (src/pages/HomePage.tsx) — the post-connect landing / device summary
// screen. HomePage itself is a static "Welcome to DYA Studio" landing (guide +
// DYA keyboard series cards + Q&A); the live device identity is surfaced by the
// connected AppLayout header, which shows the DUT's own GetDeviceInfo name.
//
// This spec proves that after a full protobuf RPC connect to the real dya2
// firmware in Renode (over the shimmed WebSerial -> emulated USB CDC), the app
// lands on the Home tab, the header carries the device's real name ("DYA2"),
// and HomePage renders. Read-only: no device writes.
test("dya-studio Home tab: connects to real dya2 firmware in Renode and renders the landing for DYA2", async ({
  page,
}) => {
  if (process.env.E2E_DEBUG) {
    page.on("console", (m) => console.log(`PAGE [${m.type()}] ${m.text()}`));
    page.on("pageerror", (e) => console.log(`PAGE ERROR ${e.message}`));
  }

  // Full connect handshake against the real DUT; resolves on the connected
  // layout (header shows the device name "DYA2").
  await connectDya2(page);

  // The connected header carries the DUT's own name from GetDeviceInfo — this is
  // the live "device summary" bit of the Home landing (everything else on
  // HomePage is static marketing content).
  await expect(
    page.locator("header").getByText(DYA2_DEVICE_NAME),
  ).toBeVisible();

  // Home is the default tab; click it explicitly so the assertion is robust even
  // if a future default changes. The tab is a radix Tabs.Trigger (role="tab").
  await page.getByRole("tab", { name: "Home" }).click();

  // HomePage RENDERS: its landing heading + a couple of unique static strings
  // that only appear on the Home tab. (These are the same for every DUT — their
  // job here is to prove the Home tab content mounted after connect.)
  await expect(
    page.getByRole("heading", { name: "Welcome to DYA Studio" }),
  ).toBeVisible();
  await expect(page.getByText("DYA is pronounced dai-a.")).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Features - What you can do with DYA Studio",
    }),
  ).toBeVisible();

  // The DYA2 keyboard card (unique blurb) is present in the DYA keyboard series
  // section — the DUT under test is a DYA2.
  await expect(
    page.getByText(
      "Next generation DYA keyboard, 60% split, standard row-staggered layout.",
    ),
  ).toBeVisible();
});
