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

## Adding a DUT (e.g. a real dya2 build)

Append one entry to the `duts` JSON in the `matrix` job of
`.github/workflows/renode-webserial-e2e.yml` (`id`, `build_yaml`, `cmake_args`,
`device`). Both the build and e2e jobs fan out over it automatically.
