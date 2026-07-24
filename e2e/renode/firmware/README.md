# DUT firmware for the WebSerial ⇄ Renode e2e

The e2e harness (`../`) drives the real dya-studio against a real, hardware-
flashable ZMK `studio-rpc-usb-uart` image running in Renode. This directory
documents how each **DUT (device under test)** firmware is built so the CI
firmware matrix (`.github/workflows/renode-webserial-e2e.yml`) is reproducible.

The build config lives in
[cormoran/zmk-west-commands](https://github.com/cormoran/zmk-west-commands)'s
`tests/zmk-config` (the `renode_tester` shield, advertised name **"Renode"**).
The stock shield keymap is a single-layer 2×2 `&kp A / &kp B / &kp C / &kp D`.
We do **not** vendor the firmware here — CI builds it fresh from that repo — but
we **do** vendor a keymap the CI overlays onto that shield (see
`renode_tester_multilayer.keymap` and the `official-unlocked` recipe below).

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

### `official-unlocked` — the Keymap-tab DUT (multi-layer)

The exact `studio-rpc-usb-uart` image built from stock `build-ble.yaml`
(`xiao_ble//zmk`, `renode_tester` shield, `-DCONFIG_ZMK_STUDIO=y`, snippet
`studio-rpc-usb-uart`) **plus `CONFIG_ZMK_STUDIO_LOCKING=n`** so the device boots
**unlocked**, and **plus the vendored 4-layer keymap overlaid onto the shield**.

Why unlocked: ZMK Studio only serves the keymap once the device is unlocked, but
official ZMK has no RPC unlock and the `renode_tester` shield does not bind
`&studio_unlock`. `CONFIG_ZMK_STUDIO_LOCKING=n` is a stock ZMK Kconfig (not
fork-only) that makes the device boot unlocked, so the Keymap tab reaches the
keymap on an official image. All of `tests/official/*` require this DUT.

**Why multi-layer.** ZMK's layer capacity equals the number of DT layer nodes,
so on the stock single-layer keymap the Studio Add/Delete/Move-layer actions are
all disabled — `tests/official/keymap-layers.spec.ts` (reorder / rename /
delete+restore) can't run. We therefore overlay
[`renode_tester_multilayer.keymap`](./renode_tester_multilayer.keymap) — **four
named layers** Base (`&kp A/B/C/D`) / Lower (`N1-4`) / Raise (`F1-4`) / Adjust
(`X/Y/Z/W`), each with a `display-name` — over the shield's
`renode_tester.keymap` before building. The Base layer keeps the A/B/C/D
bindings, so `tests/official/keymap.spec.ts` (Base A→F edit) and
`tests/official/reset.spec.ts` still hold.

**How CI overlays it.** In the `build-dut` job, after checking out the DUT config
repo, CI checks out this repo to `_overlay-src/` and copies the vendored keymap
over the shield keymap, then builds normally:

```bash
cp _overlay-src/e2e/renode/firmware/renode_tester_multilayer.keymap \
   tests/zmk-config/boards/shields/renode_tester/renode_tester.keymap
west zmk-build tests/zmk-config \
  --build-yaml tests/zmk-config/build-ble.yaml \
  --cmake-args ' -DCONFIG_ZMK_STUDIO_LOCKING=n' \
  -af ble -d build
# -> build/ble/zephyr/zmk.elf   (DEVICE_NAME=Renode, 4 layers)
```

To build it locally, copy `renode_tester_multilayer.keymap` (from this dir) over
`tests/zmk-config/boards/shields/renode_tester/renode_tester.keymap` in your
zmk-west-commands checkout before running the `west zmk-build` above.

Confirm it is unlocked: `build/ble/zephyr/.config` should show
`# CONFIG_ZMK_STUDIO_LOCKING is not set` (and `CONFIG_ZMK_STUDIO=y`).

**Spec ordering (important).** `tests/official/reset.spec.ts` is **destructive**:
it persists a keymap edit then factory-resets (wipes NVS). It must run in its own
Renode boot, so CI runs it via a separate `run-local.sh` invocation
(`destructive_specs` in the matrix). Locally, run the composable specs in one
boot and reset in another:

```bash
# one boot: connect + layer management + Base-layer edit (each reverts itself,
# except keymap.spec persists A->F, which is why reset must NOT share this boot)
... bash run-local.sh <elf> tests/common \
      tests/official/keymap-layers.spec.ts tests/official/keymap.spec.ts
# a SEPARATE fresh boot for the destructive reset
... bash run-local.sh <elf> tests/official/reset.spec.ts
```

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

The real dya2 keyboard, built from
[cormoran/zmk-keyboard-dya2](https://github.com/cormoran/zmk-keyboard-dya2)
(branch `support-new-zmk-modules`). It is a **wired split** whose **central**
(`right_trackball_studio_unlocked`) advertises name **"DYA2"**, runs Studio over
USB CDC, boots **unlocked**, and carries the PMW3610 trackball on its own SPI0.
Its inter-half link is `zmk,wired-split` on **uart0** (half-duplex, 19200 baud,
RX/TX both P0.03), so the central needs a **peripheral peer** to boot cleanly —
the harness boots it as **two machines** (see the recipe below).

```bash
git clone -b support-new-zmk-modules https://github.com/cormoran/zmk-keyboard-dya2
cd zmk-keyboard-dya2
west init -l . --mf config/west-workspace.yml   # pins cormoran/zmk main+dya + ~20 feature modules
west update --narrow
west zephyr-export
# central (DUT) + peripheral (wired-split peer) -- BOTH halves are needed
west zmk-build config -af right_trackball_studio_unlocked -d build
west zmk-build config -af left -d build
# -> build/right_trackball_studio_unlocked/zephyr/zmk.elf   (central, DEVICE_NAME=DYA2)
# -> build/left/zephyr/zmk.elf                              (wired-split peripheral)
```

Confirm the central is unlocked: `.config` has
`# CONFIG_ZMK_STUDIO_LOCKING is not set`, `CONFIG_ZMK_KEYBOARD_NAME="DYA2"`,
`CONFIG_PMW3610=y`.

Run the two-machine wired split (`DYA2_PERIPHERAL_ELF` selects it). **Run each
spec in its OWN boot** — the dya2 DUT serves only **one Studio connection per
Renode boot** (see "Per-boot execution" below), so `run-local.sh` is invoked
once per spec (it boots one Renode per call):

```bash
cd ..                      # e2e/renode
for spec in tests/common/connect.spec.ts tests/dya2/*.spec.ts; do
  ZMK_WC_RENODE_LIB=/path/to/zmk-west-commands/scripts/lib/renode \
  DEVICE_NAME=DYA2 RENODE_PLATFORM=dya2 \
  DYA2_PERIPHERAL_ELF=/path/to/build/left/zephyr/zmk.elf \
    bash run-local.sh \
      /path/to/build/right_trackball_studio_unlocked/zephyr/zmk.elf \
      "$spec"
done
```

### Per-boot execution (dya2)

The dya2 two-machine (wired-split) central serves only **one Studio connection
per Renode boot**; a second connect desyncs on buffered bytes ("device did not
respond"). So dya2 specs **must not share a boot**: never combine
`tests/common/connect.spec.ts` with a `tests/dya2/*.spec.ts`, and never pass
multiple specs to one `run-local.sh` call. Each spec gets its own fresh boot
(the loop above; ~2–3 min each since the CDC wires only after ~90–130 s).

There is also a **page-load auto-reconnect**: the WebSerial shim always reports
the paired port, so dya-studio reconnects with no click — the shared
`connectDya2` (`tests/dya2/dya2.helpers.ts`) prefers that path and clicks
"Connect via USB" only as a fallback (clicking during auto-reconnect opens the
port twice and desyncs the RPC framing). Both facts are documented at the top of
`dya2.helpers.ts`.

The CI workflow encodes this with a per-DUT `one_connection_per_boot` matrix
flag: when true, the `e2e` job loops `run-local.sh` once per spec (expanding the
`tests/dya2` dir to its individual `*.spec.ts`) instead of the single-boot run
official uses.

`RENODE_PLATFORM=dya2` + `DYA2_PERIPHERAL_ELF` makes `renode_serve.py` boot
`platforms/dya2_wired_split.resc`: the **central** on
`xiao_nrf52840_usb_pmw3610.repl` (USB real-binary platform + PMW3610 trackball on
SPIM0 + LATCH-aware gpio1) and the **peripheral** on
`xiao_nrf52840_dya2_peripheral.repl` (Python-stub real platform: usbd/qspi/ficr/
nvmc stubs, no USB CDC bridge), with **both halves' uart0 cross-connected through
one Renode UART hub** (the half-duplex split wire). Studio still rides the
central's USB CDC exactly as in single-machine mode. Inject pointer motion over
the monitor on the central machine:
`sysbus.dya2_right.spi0.trackball QueueMotion <dx> <dy>`. Without
`DYA2_PERIPHERAL_ELF`, `renode_serve.py` falls back to the single-machine
`dya2_single.resc` (central only) — which does **not** enumerate USB (see below).

> **Why two machines (root cause of the old "USB never enumerates" blocker).**
> Three dya2-specific issues had to be handled in the vendored platforms +
> harness; the previous single-machine boot hit all three:
>
> 1. **`nfct-pins-as-gpios` reset loop.** dya2's DT frees the NFC pins as GPIO.
>    Zephyr's nRF `SystemInit` reads `UICR.NFCPINS`, and because Renode's SVD
>    returns `0xFFFFFFFF` (NFC enabled) and drops the firmware's UICR write, it
>    `NVIC_SystemReset()`s on **every** boot. A `SYSRESETREQ` resets VTOR to 0
>    (empty flash; the image is at 0x27000), so the CPU **halted before any
>    firmware ran** — the USBD hardware model alone then ACKs `SET_ADDRESS` but
>    nothing answers `GET_DESCRIPTOR`, exactly the symptom seen. Fixed by an
>    `NFCPINS=0xFFFFFFFE` tag in both repls (bit0 clear ⇒ GPIO already
>    configured ⇒ SystemInit skips the reset).
> 2. **Unmodeled SPIM3 (WS2812 LED strip) ⇒ watchdog reboot.** dya2's animation
>    drives an SK6812 strip on `&spi3` (0x4002F000). Unmodeled, the WS2812
>    EasyDMA transfer never raises `EVENTS_END`, the animation work blocks
>    forever, the central's watchdog feed starves, and it software-reboots ~10s
>    in. Fixed by modeling `spi3` as a plain EasyDMA SPIM in both repls.
> 3. **Wired-split link needs a peer.** Even booting cleanly, the central's
>    `zmk,wired-split` machinery (uart0, half-duplex, INTERRUPT mode) with **no
>    peripheral** keeps USB from wiring. Giving uart0 a real peripheral peer
>    (the second machine) lets USB enumerate and the Studio CDC wire.
>
> With all three addressed, the central **does** complete USB enumeration and
> dya-studio fully connects (`tests/common/connect.spec.ts` passes). It is still
> `experimental`/`continue-on-error` because the two-machine boot is heavy and
> slow: the CDC wires only after **~90–130 s** of wall clock (hence the longer
> `RENODE_WIRING_TIMEOUT`/readiness waits), and the half-duplex split link floods
> the central with `Prefix mismatch` RX (Renode doesn't model the half-duplex
> PSEL TX/RX turnaround), which can starve the central's watchdog and reboot it
> — so runs are occasionally flaky. Connect is reliable in practice but not yet
> hardened, so the job stays non-blocking.

## Adding a DUT

Append one entry to the `duts` JSON in the `matrix` job of
`.github/workflows/renode-webserial-e2e.yml`. Each entry carries its own build
source (`repo`/`ref`/`manifest`/`build`/`elf`), its `device` name, its Renode
`platform` (`""` harness USB, `dya2` USB+trackball), its `specs` dirs/files (run
in one boot; `tests/common` for all, plus `tests/official` or `tests/dya2`), and
an `experimental` flag (allow the e2e job to fail). Optional fields:
`keymap_overlay` — a keymap vendored in this repo (path from the dya-studio repo
root) that `build-dut` copies over the `renode_tester` shield keymap before
building (the official DUT uses this for its 4-layer keymap); `destructive_specs`
— specs that wipe device state and must run in their own second Renode boot;
`one_connection_per_boot` — true if the DUT serves only one Studio connection
per boot (dya2), making the `e2e` job run each spec in its own boot (see
"Per-boot execution" above).
A **wired-split** DUT also sets `peripheral_build`/`peripheral_elf` for its
second half; the build job builds + uploads it and the e2e job downloads it and
forwards it as `DYA2_PERIPHERAL_ELF` so `renode_serve.py` boots two machines.
Both the build and e2e jobs fan out over the list automatically.
