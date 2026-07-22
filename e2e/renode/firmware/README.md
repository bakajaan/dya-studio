# DUT firmware for the WebSerial ⇄ Renode e2e

The e2e harness (`../`) drives the real dya-studio against a real, hardware-
flashable ZMK `studio-rpc-usb-uart` image running in Renode. This directory
documents how each **DUT (device under test)** firmware is built so the CI
firmware matrix (`.github/workflows/renode-webserial-e2e.yml`) is reproducible.

The build config lives in
[cormoran/zmk-west-commands](https://github.com/cormoran/zmk-west-commands)'s
`tests/zmk-config` (the `renode_tester` shield: a single-layer 2×2 keymap
`&kp A / &kp B / &kp C / &kp D`, advertised name **"Renode"**). We do **not**
vendor firmware here — CI builds it fresh from that repo.

## Prerequisites

- A Zephyr SDK (CI uses the `zmkfirmware/zmk-build-arm:stable` container).
- Renode 1.16.1 for the run side (`scripts/lib/renode/install_renode.sh`).

## Build the DUTs

Set up a standalone west workspace from zmk-west-commands and build. The manifest
`scripts/west-test-standalone.yml` pins the ZMK source; `scripts/west-test.yml`
selects **`zmkfirmware/zmk@main`** (official, non-fork) by default.

```bash
git clone https://github.com/cormoran/zmk-west-commands
cd zmk-west-commands
west init -l . --mf scripts/west-test-standalone.yml
west update --narrow
west zephyr-export
```

### `official-unlocked` — the Keymap-tab DUT

The exact `studio-rpc-usb-uart` image built from stock `build-ble.yaml`
(`xiao_ble//zmk`, `renode_tester` shield, `-DCONFIG_ZMK_STUDIO=y`, snippet
`studio-rpc-usb-uart`) **plus `CONFIG_ZMK_STUDIO_LOCKING=n`** so the device boots
**unlocked**.

Why unlocked: ZMK Studio only serves the keymap once the device is unlocked, but
official ZMK has no RPC unlock and the `renode_tester` shield does not bind
`&studio_unlock`. `CONFIG_ZMK_STUDIO_LOCKING=n` is a stock ZMK Kconfig (not
fork-only) that makes the device boot unlocked, so the Keymap tab reaches the
keymap on an official image. `tests/keymap.spec.ts` requires this DUT.

Merge the extra Kconfig onto the stock yaml with `--cmake-args` (this is exactly
what CI does — no extra yaml needed):

```bash
west zmk-build tests/zmk-config \
  --build-yaml tests/zmk-config/build-ble.yaml \
  --cmake-args ' -DCONFIG_ZMK_STUDIO_LOCKING=n' \
  -af ble -d build
# -> build/ble/zephyr/zmk.elf   (DEVICE_NAME=Renode)
```

Confirm it is unlocked: `build/ble/zephyr/.config` should show
`# CONFIG_ZMK_STUDIO_LOCKING is not set` (and `CONFIG_ZMK_STUDIO=y`).

Equivalent plain-west fallback:

```bash
west build -b xiao_ble//zmk -S studio-rpc-usb-uart -s <zmk app> -- \
  -DSHIELD=renode_tester -DCONFIG_ZMK_STUDIO=y -DCONFIG_ZMK_STUDIO_LOCKING=n
```

### `ble` (locked) — connect-only

Stock `build-ble.yaml` with no extra args builds the **locked** image. It still
passes `tests/connect.spec.ts` (connect does not need the keymap) but a locked
device returns empty/error for `get_keymap`, so it cannot satisfy
`tests/keymap.spec.ts`. The e2e matrix therefore uses `official-unlocked` for the
full suite.

## Run the suite against a DUT

```bash
cd ..                      # e2e/renode
ZMK_WC_RENODE_LIB=/path/to/zmk-west-commands/scripts/lib/renode \
DEVICE_NAME=Renode \
  bash run-local.sh /path/to/build/ble/zephyr/zmk.elf
# add e.g. `tests/keymap.spec.ts` to run a single spec; E2E_DEBUG=1 for logs.
```

### `dya2-unlocked` — the real dya2 trackball DUT (experimental)

The real dya2 keyboard's central image, built from
[cormoran/zmk-keyboard-dya2](https://github.com/cormoran/zmk-keyboard-dya2)
(branch `support-new-zmk-modules`). It is a split **central** advertising name
**"DYA2"**, runs Studio over USB CDC, boots **unlocked**, and carries the
PMW3610 trackball on its own SPI0.

```bash
git clone -b support-new-zmk-modules https://github.com/cormoran/zmk-keyboard-dya2
cd zmk-keyboard-dya2
west init -l . --mf config/west-workspace.yml   # pins cormoran/zmk main+dya + ~20 feature modules
west update --narrow
west zephyr-export
west zmk-build config -af right_trackball_studio_unlocked -d build
# -> build/right_trackball_studio_unlocked/zephyr/zmk.elf   (DEVICE_NAME=DYA2)
```

Confirm unlocked: `.config` has `# CONFIG_ZMK_STUDIO_LOCKING is not set`,
`CONFIG_ZMK_KEYBOARD_NAME="DYA2"`, `CONFIG_PMW3610=y`.

Run it on the vendored USB+PMW3610 Renode platform (adds the simulated
trackball so the Trackball tab / pointer motion is exercisable):

```bash
cd ..                      # e2e/renode
ZMK_WC_RENODE_LIB=/path/to/zmk-west-commands/scripts/lib/renode \
DEVICE_NAME=DYA2 RENODE_PLATFORM=dya2 \
  bash run-local.sh /path/to/build/right_trackball_studio_unlocked/zephyr/zmk.elf \
  tests/common tests/dya2
```

`RENODE_PLATFORM=dya2` makes `renode_serve.py` boot
`platforms/xiao_nrf52840_usb_pmw3610.repl` (the harness USB real-binary platform
merged with the PMW3610 trackball on SPIM0 + the LATCH-aware gpio1). Inject
pointer motion over the monitor: `sysbus.spi0.trackball QueueMotion <dx> <dy>`.

> **Known blocker (why this DUT is `experimental` in CI).** The real dya2 image
> does **not** complete USB enumeration in Renode, so dya-studio cannot connect
> to it yet. The device ACKs `SET_ADDRESS` (handled at ISR level by the nrfx
> USBD driver) but never answers `GET_DESCRIPTOR(CONFIGURATION)` /
> `SET_CONFIGURATION` — the Zephyr USB device work-queue thread never services
> control transfers. The identical harness/platform enumerates the official DUT
> fully (166-byte config descriptor, CDC wired), so it is the dya2 **image**,
> not the platform or the trackball model (it fails identically on the plain USB
> platform _and_ the combined trackball platform, which loads spi0 + PMW3610
> correctly). dya2 is a heavy dual-transport (BLE central + wired) split
> **central** with ~20 feature modules; that boot workload appears to
> starve/block the USB device thread. The DUT's build is verified and it fans
> out through the matrix; its e2e job is `continue-on-error` until the USB
> blocker is resolved (candidate next steps: boot with the wired split
> peripheral present so the split machinery settles, or bump the USB thread
> priority / defer heavy module init).

## Adding a DUT

Append one entry to the `duts` JSON in the `matrix` job of
`.github/workflows/renode-webserial-e2e.yml`. Each entry carries its own build
source (`repo`/`ref`/`manifest`/`build`/`elf`), its `device` name, its Renode
`platform` (`""` harness USB, `dya2` USB+trackball), its `specs` dirs
(`tests/common` for all, plus `tests/official` or `tests/dya2`), and an
`experimental` flag (allow the e2e job to fail). Both the build and e2e jobs fan
out over it automatically.
