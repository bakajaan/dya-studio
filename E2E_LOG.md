# e2e (dya2-nonsplit-unlocked) log excerpt

total lines: 952

## Playwright result lines
```
597:2026-08-10T00:30:10.2520285Z [36;1m    specs=$(ls "$entry"/*.spec.ts)[0m
603:2026-08-10T00:30:10.2522494Z [36;1m    # (~1-2 min) only to run a fully-skipped file is pure waste[0m
604:2026-08-10T00:30:10.2522967Z [36;1m    # (tests/dya2/trackball.spec.ts is entirely test.fixme). Logged, not[0m
617:2026-08-10T00:30:10.2527274Z [36;1m      echo "::warning::$spec failed on attempt $attempt"[0m
633:2026-08-10T00:30:10.2679459Z ##[group]Renode boot for tests/common/connect.spec.ts (attempt 1)
640:2026-08-10T00:31:40.6794047Z Running 1 test using 1 worker
642:2026-08-10T00:31:44.5523311Z   ✓  1 [chromium] › tests/common/connect.spec.ts:11:1 › dya-studio (real app) fully connects to real firmware in Renode over WebSerial (1.4s)
644:2026-08-10T00:31:44.6119694Z   1 passed (4.4s)
646:2026-08-10T00:31:44.6825248Z ##[group]Renode boot for tests/dya2/connection.spec.ts (attempt 1)
653:2026-08-10T00:33:13.9926378Z Running 1 test using 1 worker
655:2026-08-10T00:33:46.8837343Z   ✘  1 [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write (32.1s)
658:2026-08-10T00:33:46.9134548Z   1) [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
660:2026-08-10T00:33:46.9138717Z     Error: expect(locator).toBeVisible() failed
681:2026-08-10T00:33:46.9163994Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/connection.spec.ts:63:56
693:2026-08-10T00:33:46.9173534Z   1 failed
694:2026-08-10T00:33:46.9174953Z     [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
700:2026-08-10T00:33:46.9672204Z ##[warning]tests/dya2/connection.spec.ts failed on attempt 1
701:2026-08-10T00:33:46.9683655Z ##[group]Renode boot for tests/dya2/connection.spec.ts (attempt 2)
708:2026-08-10T00:35:16.1870865Z Running 1 test using 1 worker
710:2026-08-10T00:35:49.0299903Z   ✘  1 [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write (32.1s)
713:2026-08-10T00:35:49.0650088Z   1) [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
715:2026-08-10T00:35:49.0653289Z     Error: expect(locator).toBeVisible() failed
736:2026-08-10T00:35:49.0665637Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/connection.spec.ts:63:56
748:2026-08-10T00:35:49.0674627Z   1 failed
749:2026-08-10T00:35:49.0675618Z     [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
755:2026-08-10T00:35:49.1164531Z ##[warning]tests/dya2/connection.spec.ts failed on attempt 2
756:2026-08-10T00:35:49.1187540Z ##[group]Renode boot for tests/dya2/home.spec.ts (attempt 1)
763:2026-08-10T00:37:18.4177453Z Running 1 test using 1 worker
765:2026-08-10T00:37:20.8463073Z   ✓  1 [chromium] › tests/dya2/home.spec.ts:13:1 › dya-studio Home tab: connects to real dya2 firmware in Renode and renders the landing for DYA2 (1.8s)
767:2026-08-10T00:37:20.8984756Z   1 passed (3.0s)
769:2026-08-10T00:37:20.9463245Z ##[group]Renode boot for tests/dya2/keymap.spec.ts (attempt 1)
776:2026-08-10T00:38:50.3283083Z Running 1 test using 1 worker
778:2026-08-10T00:38:57.8172394Z   ✓  1 [chromium] › tests/dya2/keymap.spec.ts:71:1 › dya2 Keymap tab: renders the rich keymap and round-trips (+reverts) a binding edit (6.9s)
780:2026-08-10T00:38:57.8921756Z   1 passed (8.1s)
782:2026-08-10T00:38:57.9501297Z ##[group]Renode boot for tests/dya2/macro-combo.spec.ts (attempt 1)
789:2026-08-10T00:40:27.3363970Z Running 2 tests using 1 worker
791:2026-08-10T00:45:32.9264488Z   ✘  1 [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete (5.1m)
792:2026-08-10T00:45:32.9286948Z   -  2 [chromium] › tests/dya2/macro-combo.spec.ts:115:6 › dya2 Macro&Combo tab: runtime combo create -> persist -> round-trip -> delete
795:2026-08-10T00:45:32.9615891Z   1) [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete 
812:2026-08-10T00:45:32.9633162Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/macro-combo.spec.ts:96:6
824:2026-08-10T00:45:32.9640235Z   1 failed
825:2026-08-10T00:45:32.9642671Z     [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete 
826:2026-08-10T00:45:32.9643276Z   1 skipped
832:2026-08-10T00:45:33.0085277Z ##[warning]tests/dya2/macro-combo.spec.ts failed on attempt 1
833:2026-08-10T00:45:33.0087408Z ##[group]Renode boot for tests/dya2/macro-combo.spec.ts (attempt 2)
840:2026-08-10T00:47:02.2433833Z Running 2 tests using 1 worker
842:2026-08-10T00:47:16.9243228Z   ✓  1 [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete (14.0s)
843:2026-08-10T00:47:16.9263274Z   -  2 [chromium] › tests/dya2/macro-combo.spec.ts:115:6 › dya2 Macro&Combo tab: runtime combo create -> persist -> round-trip -> delete
845:2026-08-10T00:47:16.9984140Z   1 skipped
846:2026-08-10T00:47:16.9984465Z   1 passed (15.2s)
848:2026-08-10T00:47:17.0527164Z ##[group]Renode boot for tests/dya2/settings.spec.ts (attempt 1)
855:2026-08-10T00:48:46.4005524Z Running 1 test using 1 worker
857:2026-08-10T00:48:56.3288930Z   ✓  1 [chromium] › tests/dya2/settings.spec.ts:83:1 › dya2 Settings tab: reads, changes, persists and reverts the Idle Timeout (zmk__settings) (9.3s)
859:2026-08-10T00:48:56.3923684Z   1 passed (10.6s)
861:2026-08-10T00:48:56.4409991Z ##[group]Renode boot for tests/dya2/subsystems.spec.ts (attempt 1)
868:2026-08-10T00:50:25.7288182Z Running 1 test using 1 worker
870:2026-08-10T00:50:28.4735904Z   ✓  1 [chromium] › tests/dya2/subsystems.spec.ts:43:1 › dya-studio Subsystems tab: enumerates the real dya2 custom Studio-RPC subsystems in Renode (2.0s)
872:2026-08-10T00:50:28.5332818Z   1 passed (3.4s)
874:2026-08-10T00:50:28.5802170Z ##[notice]skipping tests/dya2/trackball.spec.ts (no active test — all fixme/skip)
875:2026-08-10T00:50:28.5811909Z ##[group]Renode boot for tests/dya2/troubleshooting.spec.ts (attempt 1)
882:2026-08-10T00:51:57.8979226Z Running 1 test using 1 worker
884:2026-08-10T00:52:01.0553916Z   ✓  1 [chromium] › tests/dya2/troubleshooting.spec.ts:34:1 › dya2 Troubleshooting tab: renders real diagnostics for device-info, watchdog and pmw3610 (2.5s)
886:2026-08-10T00:52:01.1179373Z   1 passed (3.8s)
```

## Error-ish lines
```
617:2026-08-10T00:30:10.2527274Z [36;1m      echo "::warning::$spec failed on attempt $attempt"[0m
660:2026-08-10T00:33:46.9138717Z     Error: expect(locator).toBeVisible() failed
662:2026-08-10T00:33:46.9141251Z     Locator:  locator('div.glass-card').first()
665:2026-08-10T00:33:46.9152514Z     Timeout:  30000ms
669:2026-08-10T00:33:46.9154144Z       - waiting for locator('div.glass-card').first()
670:2026-08-10T00:33:46.9155235Z         61 × locator resolved to <div class="glass-card p-6 mb-6">…</div>
676:2026-08-10T00:33:46.9159537Z     > 63 |   await expect(page.locator("div.glass-card").first()).toBeVisible();
683:2026-08-10T00:33:46.9165516Z     Error Context: test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/error-context.md
715:2026-08-10T00:35:49.0653289Z     Error: expect(locator).toBeVisible() failed
717:2026-08-10T00:35:49.0654464Z     Locator:  locator('div.glass-card').first()
720:2026-08-10T00:35:49.0656203Z     Timeout:  30000ms
724:2026-08-10T00:35:49.0657921Z       - waiting for locator('div.glass-card').first()
725:2026-08-10T00:35:49.0658998Z         61 × locator resolved to <div class="glass-card p-6 mb-6">…</div>
731:2026-08-10T00:35:49.0663295Z     > 63 |   await expect(page.locator("div.glass-card").first()).toBeVisible();
738:2026-08-10T00:35:49.0666492Z     Error Context: test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/error-context.md
797:2026-08-10T00:45:32.9621152Z     Error: expect(received).toBe(expected) // Object.is equality
803:2026-08-10T00:45:32.9623768Z     - Timeout 300000ms exceeded while waiting on the predicate
806:2026-08-10T00:45:32.9625559Z       95 |     expect(await macroButton.count()).toBe(0);
809:2026-08-10T00:45:32.9627736Z       97 |   await expect(items).toHaveCount(before.length);
814:2026-08-10T00:45:32.9634681Z     Error Context: test-results/dya2-macro-combo-dya2-Macr-3c136-rsist---round-trip---delete-chromium/error-context.md
857:2026-08-10T00:48:56.3288930Z   ✓  1 [chromium] › tests/dya2/settings.spec.ts:83:1 › dya2 Settings tab: reads, changes, persists and reverts the Idle Timeout (zmk__settings) (9.3s)
```

## Tail
```
2026-08-10T00:33:13.9926378Z Running 1 test using 1 worker
2026-08-10T00:33:13.9949623Z 
2026-08-10T00:33:46.8837343Z   ✘  1 [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write (32.1s)
2026-08-10T00:33:46.9109483Z 
2026-08-10T00:33:46.9130871Z 
2026-08-10T00:33:46.9134548Z   1) [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
2026-08-10T00:33:46.9135955Z 
2026-08-10T00:33:46.9138717Z     Error: expect(locator).toBeVisible() failed
2026-08-10T00:33:46.9139338Z 
2026-08-10T00:33:46.9141251Z     Locator:  locator('div.glass-card').first()
2026-08-10T00:33:46.9151663Z     Expected: visible
2026-08-10T00:33:46.9152099Z     Received: hidden
2026-08-10T00:33:46.9152514Z     Timeout:  30000ms
2026-08-10T00:33:46.9152770Z 
2026-08-10T00:33:46.9152926Z     Call log:
2026-08-10T00:33:46.9153427Z       - Expect "toBeVisible" with timeout 30000ms
2026-08-10T00:33:46.9154144Z       - waiting for locator('div.glass-card').first()
2026-08-10T00:33:46.9155235Z         61 × locator resolved to <div class="glass-card p-6 mb-6">…</div>
2026-08-10T00:33:46.9156049Z            - unexpected value "hidden"
2026-08-10T00:33:46.9156419Z 
2026-08-10T00:33:46.9156428Z 
2026-08-10T00:33:46.9156971Z       61 |   // ble-management reports the profile rows; assert a Bluetooth "Profile"/OS
2026-08-10T00:33:46.9158486Z       62 |   // card or the USB card is present so the read coverage is explicit.
2026-08-10T00:33:46.9159537Z     > 63 |   await expect(page.locator("div.glass-card").first()).toBeVisible();
2026-08-10T00:33:46.9160363Z          |                                                        ^
2026-08-10T00:33:46.9161163Z       64 |
2026-08-10T00:33:46.9161859Z       65 |   // 2) Pick an ENABLED default-layer <select> that exposes at least two real
2026-08-10T00:33:46.9162867Z       66 |   //    layer options (value >= 0), so we have a distinct target to write.
2026-08-10T00:33:46.9163994Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/connection.spec.ts:63:56
2026-08-10T00:33:46.9164669Z 
2026-08-10T00:33:46.9165516Z     Error Context: test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/error-context.md
2026-08-10T00:33:46.9166435Z 
2026-08-10T00:33:46.9167269Z     attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
2026-08-10T00:33:46.9168645Z     test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/trace.zip
2026-08-10T00:33:46.9169621Z     Usage:
2026-08-10T00:33:46.9169866Z 
2026-08-10T00:33:46.9171035Z         npx playwright show-trace test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/trace.zip
2026-08-10T00:33:46.9172048Z 
2026-08-10T00:33:46.9172822Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-08-10T00:33:46.9173364Z 
2026-08-10T00:33:46.9173534Z   1 failed
2026-08-10T00:33:46.9174953Z     [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
2026-08-10T00:33:46.9415978Z renode log tail:
2026-08-10T00:33:46.9435730Z dya2 platform: USB CDC + simulated PMW3610 trackball
2026-08-10T00:33:46.9437197Z single CDC function (Studio only); Studio = cdc0
2026-08-10T00:33:46.9437991Z relay: bridge client attached
2026-08-10T00:33:46.9645788Z ##[endgroup]
2026-08-10T00:33:46.9672204Z ##[warning]tests/dya2/connection.spec.ts failed on attempt 1
2026-08-10T00:33:46.9683655Z ##[group]Renode boot for tests/dya2/connection.spec.ts (attempt 2)
2026-08-10T00:33:46.9688083Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:35:14.3144329Z >>> Renode Studio USB CDC relayed on TCP :34065
2026-08-10T00:35:14.3145704Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:35:14.8226958Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:35:16.1280529Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:35:16.1870364Z 
2026-08-10T00:35:16.1870865Z Running 1 test using 1 worker
2026-08-10T00:35:16.1898361Z 
2026-08-10T00:35:49.0299903Z   ✘  1 [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write (32.1s)
2026-08-10T00:35:49.0628433Z 
2026-08-10T00:35:49.0647972Z 
2026-08-10T00:35:49.0650088Z   1) [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
2026-08-10T00:35:49.0653026Z 
2026-08-10T00:35:49.0653289Z     Error: expect(locator).toBeVisible() failed
2026-08-10T00:35:49.0653957Z 
2026-08-10T00:35:49.0654464Z     Locator:  locator('div.glass-card').first()
2026-08-10T00:35:49.0655325Z     Expected: visible
2026-08-10T00:35:49.0655793Z     Received: hidden
2026-08-10T00:35:49.0656203Z     Timeout:  30000ms
2026-08-10T00:35:49.0656458Z 
2026-08-10T00:35:49.0656628Z     Call log:
2026-08-10T00:35:49.0657157Z       - Expect "toBeVisible" with timeout 30000ms
2026-08-10T00:35:49.0657921Z       - waiting for locator('div.glass-card').first()
2026-08-10T00:35:49.0658998Z         61 × locator resolved to <div class="glass-card p-6 mb-6">…</div>
2026-08-10T00:35:49.0660211Z            - unexpected value "hidden"
2026-08-10T00:35:49.0660564Z 
2026-08-10T00:35:49.0660575Z 
2026-08-10T00:35:49.0661543Z       61 |   // ble-management reports the profile rows; assert a Bluetooth "Profile"/OS
2026-08-10T00:35:49.0662588Z       62 |   // card or the USB card is present so the read coverage is explicit.
2026-08-10T00:35:49.0663295Z     > 63 |   await expect(page.locator("div.glass-card").first()).toBeVisible();
2026-08-10T00:35:49.0663776Z          |                                                        ^
2026-08-10T00:35:49.0664076Z       64 |
2026-08-10T00:35:49.0664464Z       65 |   // 2) Pick an ENABLED default-layer <select> that exposes at least two real
2026-08-10T00:35:49.0665020Z       66 |   //    layer options (value >= 0), so we have a distinct target to write.
2026-08-10T00:35:49.0665637Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/connection.spec.ts:63:56
2026-08-10T00:35:49.0666027Z 
2026-08-10T00:35:49.0666492Z     Error Context: test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/error-context.md
2026-08-10T00:35:49.0667218Z 
2026-08-10T00:35:49.0668048Z     attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
2026-08-10T00:35:49.0669791Z     test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/trace.zip
2026-08-10T00:35:49.0670956Z     Usage:
2026-08-10T00:35:49.0671215Z 
2026-08-10T00:35:49.0672186Z         npx playwright show-trace test-results/dya2-connection-dya2-Conne-8c1f7--a-safe-default-layer-write-chromium/trace.zip
2026-08-10T00:35:49.0673197Z 
2026-08-10T00:35:49.0674075Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-08-10T00:35:49.0674470Z 
2026-08-10T00:35:49.0674627Z   1 failed
2026-08-10T00:35:49.0675618Z     [chromium] › tests/dya2/connection.spec.ts:31:1 › dya2 Connection tab: reads connection info and round-trips (+reverts) a safe default-layer write 
2026-08-10T00:35:49.0925707Z renode log tail:
2026-08-10T00:35:49.0939603Z dya2 platform: USB CDC + simulated PMW3610 trackball
2026-08-10T00:35:49.0941678Z single CDC function (Studio only); Studio = cdc0
2026-08-10T00:35:49.0942593Z relay: bridge client attached
2026-08-10T00:35:49.1161899Z ##[endgroup]
2026-08-10T00:35:49.1164531Z ##[warning]tests/dya2/connection.spec.ts failed on attempt 2
2026-08-10T00:35:49.1187540Z ##[group]Renode boot for tests/dya2/home.spec.ts (attempt 1)
2026-08-10T00:35:49.1222267Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:37:16.4606202Z >>> Renode Studio USB CDC relayed on TCP :39335
2026-08-10T00:37:16.4620933Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:37:16.9696915Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:37:18.2612753Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:37:18.4176889Z 
2026-08-10T00:37:18.4177453Z Running 1 test using 1 worker
2026-08-10T00:37:18.4209280Z 
2026-08-10T00:37:20.8463073Z   ✓  1 [chromium] › tests/dya2/home.spec.ts:13:1 › dya-studio Home tab: connects to real dya2 firmware in Renode and renders the landing for DYA2 (1.8s)
2026-08-10T00:37:20.8974651Z 
2026-08-10T00:37:20.8984756Z   1 passed (3.0s)
2026-08-10T00:37:20.9447716Z ##[endgroup]
2026-08-10T00:37:20.9463245Z ##[group]Renode boot for tests/dya2/keymap.spec.ts (attempt 1)
2026-08-10T00:37:20.9496706Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:38:48.2903710Z >>> Renode Studio USB CDC relayed on TCP :28187
2026-08-10T00:38:48.2905130Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:38:48.7993783Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:38:50.1361827Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:38:50.3282433Z 
2026-08-10T00:38:50.3283083Z Running 1 test using 1 worker
2026-08-10T00:38:50.3314400Z 
2026-08-10T00:38:57.8172394Z   ✓  1 [chromium] › tests/dya2/keymap.spec.ts:71:1 › dya2 Keymap tab: renders the rich keymap and round-trips (+reverts) a binding edit (6.9s)
2026-08-10T00:38:57.8904650Z 
2026-08-10T00:38:57.8921756Z   1 passed (8.1s)
2026-08-10T00:38:57.9487153Z ##[endgroup]
2026-08-10T00:38:57.9501297Z ##[group]Renode boot for tests/dya2/macro-combo.spec.ts (attempt 1)
2026-08-10T00:38:57.9532757Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:40:25.3028487Z >>> Renode Studio USB CDC relayed on TCP :36527
2026-08-10T00:40:25.3029639Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:40:25.8118434Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:40:27.1349312Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:40:27.3363118Z 
2026-08-10T00:40:27.3363970Z Running 2 tests using 1 worker
2026-08-10T00:40:27.3386997Z 
2026-08-10T00:45:32.9264488Z   ✘  1 [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete (5.1m)
2026-08-10T00:45:32.9286948Z   -  2 [chromium] › tests/dya2/macro-combo.spec.ts:115:6 › dya2 Macro&Combo tab: runtime combo create -> persist -> round-trip -> delete
2026-08-10T00:45:32.9596530Z 
2026-08-10T00:45:32.9613746Z 
2026-08-10T00:45:32.9615891Z   1) [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete 
2026-08-10T00:45:32.9619884Z 
2026-08-10T00:45:32.9621152Z     Error: expect(received).toBe(expected) // Object.is equality
2026-08-10T00:45:32.9621842Z 
2026-08-10T00:45:32.9622059Z     Expected: 0
2026-08-10T00:45:32.9622527Z     Received: 1
2026-08-10T00:45:32.9622808Z 
2026-08-10T00:45:32.9623009Z     Call Log:
2026-08-10T00:45:32.9623768Z     - Timeout 300000ms exceeded while waiting on the predicate
2026-08-10T00:45:32.9624375Z 
2026-08-10T00:45:32.9624581Z       94 |     }
2026-08-10T00:45:32.9625559Z       95 |     expect(await macroButton.count()).toBe(0);
2026-08-10T00:45:32.9626407Z     > 96 |   }).toPass({ timeout: 300_000 });
2026-08-10T00:45:32.9627049Z          |      ^
2026-08-10T00:45:32.9627736Z       97 |   await expect(items).toHaveCount(before.length);
2026-08-10T00:45:32.9628721Z       98 |   // Persist the removal if it left a pending change.
2026-08-10T00:45:32.9629679Z       99 |   if (await save.isEnabled().catch(() => false)) {
2026-08-10T00:45:32.9633162Z         at /home/runner/work/dya-studio/dya-studio/e2e/renode/tests/dya2/macro-combo.spec.ts:96:6
2026-08-10T00:45:32.9633843Z 
2026-08-10T00:45:32.9634681Z     Error Context: test-results/dya2-macro-combo-dya2-Macr-3c136-rsist---round-trip---delete-chromium/error-context.md
2026-08-10T00:45:32.9635528Z 
2026-08-10T00:45:32.9636289Z     attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
2026-08-10T00:45:32.9637302Z     test-results/dya2-macro-combo-dya2-Macr-3c136-rsist---round-trip---delete-chromium/trace.zip
2026-08-10T00:45:32.9637807Z     Usage:
2026-08-10T00:45:32.9637924Z 
2026-08-10T00:45:32.9638438Z         npx playwright show-trace test-results/dya2-macro-combo-dya2-Macr-3c136-rsist---round-trip---delete-chromium/trace.zip
2026-08-10T00:45:32.9638954Z 
2026-08-10T00:45:32.9639403Z     ────────────────────────────────────────────────────────────────────────────────────────────────
2026-08-10T00:45:32.9640029Z 
2026-08-10T00:45:32.9640235Z   1 failed
2026-08-10T00:45:32.9642671Z     [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete 
2026-08-10T00:45:32.9643276Z   1 skipped
2026-08-10T00:45:32.9906720Z renode log tail:
2026-08-10T00:45:32.9919958Z dya2 platform: USB CDC + simulated PMW3610 trackball
2026-08-10T00:45:32.9921006Z single CDC function (Studio only); Studio = cdc0
2026-08-10T00:45:32.9921410Z relay: bridge client attached
2026-08-10T00:45:33.0083465Z ##[endgroup]
2026-08-10T00:45:33.0085277Z ##[warning]tests/dya2/macro-combo.spec.ts failed on attempt 1
2026-08-10T00:45:33.0087408Z ##[group]Renode boot for tests/dya2/macro-combo.spec.ts (attempt 2)
2026-08-10T00:45:33.0117258Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:47:00.3571635Z >>> Renode Studio USB CDC relayed on TCP :33455
2026-08-10T00:47:00.3572716Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:47:00.8663129Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:47:02.1680105Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:47:02.2429130Z 
2026-08-10T00:47:02.2433833Z Running 2 tests using 1 worker
2026-08-10T00:47:02.2462655Z 
2026-08-10T00:47:16.9243228Z   ✓  1 [chromium] › tests/dya2/macro-combo.spec.ts:39:1 › dya2 Macro&Combo tab: runtime macro create -> persist -> round-trip -> delete (14.0s)
2026-08-10T00:47:16.9263274Z   -  2 [chromium] › tests/dya2/macro-combo.spec.ts:115:6 › dya2 Macro&Combo tab: runtime combo create -> persist -> round-trip -> delete
2026-08-10T00:47:16.9981466Z 
2026-08-10T00:47:16.9984140Z   1 skipped
2026-08-10T00:47:16.9984465Z   1 passed (15.2s)
2026-08-10T00:47:17.0512021Z ##[endgroup]
2026-08-10T00:47:17.0527164Z ##[group]Renode boot for tests/dya2/settings.spec.ts (attempt 1)
2026-08-10T00:47:17.0561275Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:48:44.4016427Z >>> Renode Studio USB CDC relayed on TCP :38323
2026-08-10T00:48:44.4017685Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:48:44.9107871Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:48:46.2087247Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:48:46.4004894Z 
2026-08-10T00:48:46.4005524Z Running 1 test using 1 worker
2026-08-10T00:48:46.4036926Z 
2026-08-10T00:48:56.3288930Z   ✓  1 [chromium] › tests/dya2/settings.spec.ts:83:1 › dya2 Settings tab: reads, changes, persists and reverts the Idle Timeout (zmk__settings) (9.3s)
2026-08-10T00:48:56.3916342Z 
2026-08-10T00:48:56.3923684Z   1 passed (10.6s)
2026-08-10T00:48:56.4391831Z ##[endgroup]
2026-08-10T00:48:56.4409991Z ##[group]Renode boot for tests/dya2/subsystems.spec.ts (attempt 1)
2026-08-10T00:48:56.4447700Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:50:23.7892222Z >>> Renode Studio USB CDC relayed on TCP :36186
2026-08-10T00:50:23.7893396Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:50:24.2976621Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:50:25.5622122Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:50:25.7287658Z 
2026-08-10T00:50:25.7288182Z Running 1 test using 1 worker
2026-08-10T00:50:25.7313895Z 
2026-08-10T00:50:28.4735904Z   ✓  1 [chromium] › tests/dya2/subsystems.spec.ts:43:1 › dya-studio Subsystems tab: enumerates the real dya2 custom Studio-RPC subsystems in Renode (2.0s)
2026-08-10T00:50:28.5325820Z 
2026-08-10T00:50:28.5332818Z   1 passed (3.4s)
2026-08-10T00:50:28.5782467Z ##[endgroup]
2026-08-10T00:50:28.5802170Z ##[notice]skipping tests/dya2/trackball.spec.ts (no active test — all fixme/skip)
2026-08-10T00:50:28.5811909Z ##[group]Renode boot for tests/dya2/troubleshooting.spec.ts (attempt 1)
2026-08-10T00:50:28.5845437Z >>> [1/3] booting Renode with /home/runner/work/dya-studio/dya-studio/fw/zmk.elf (real image; Studio over USB CDC)
2026-08-10T00:51:55.9253185Z >>> Renode Studio USB CDC relayed on TCP :39973
2026-08-10T00:51:55.9254391Z >>> [2/3] starting WS bridge on ws://127.0.0.1:8788
2026-08-10T00:51:56.4342420Z >>> [3/3] running Playwright (DEVICE_NAME=DYA2)
2026-08-10T00:51:57.7225867Z [WebServer] serve: dist on http://127.0.0.1:4173 (root /home/runner/work/dya-studio/dya-studio/dist)
2026-08-10T00:51:57.8976713Z 
2026-08-10T00:51:57.8979226Z Running 1 test using 1 worker
2026-08-10T00:51:57.9000221Z 
2026-08-10T00:52:01.0553916Z   ✓  1 [chromium] › tests/dya2/troubleshooting.spec.ts:34:1 › dya2 Troubleshooting tab: renders real diagnostics for device-info, watchdog and pmw3610 (2.5s)
2026-08-10T00:52:01.1172709Z 
2026-08-10T00:52:01.1179373Z   1 passed (3.8s)
2026-08-10T00:52:01.1702265Z ##[endgroup]
2026-08-10T00:52:01.1710348Z ##[error]Process completed with exit code 1.
2026-08-10T00:52:01.1785521Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-08-10T00:52:01.1786975Z ##[group]Run actions/upload-artifact@v4
2026-08-10T00:52:01.1787273Z with:
2026-08-10T00:52:01.1787548Z   name: playwright-artifacts-dya2-nonsplit-unlocked
2026-08-10T00:52:01.1788199Z   path: e2e/renode/playwright-report
e2e/renode/test-results
e2e/renode/renode_serve.err
e2e/renode/bridge.out

2026-08-10T00:52:01.1788791Z   if-no-files-found: ignore
2026-08-10T00:52:01.1789052Z   compression-level: 6
2026-08-10T00:52:01.1789295Z   overwrite: false
2026-08-10T00:52:01.1789533Z   include-hidden-files: false
2026-08-10T00:52:01.1789789Z env:
2026-08-10T00:52:01.1790010Z   ZMK_WC_REPO: cormoran/zmk-west-commands
2026-08-10T00:52:01.1790334Z   ZMK_WC_REF: main
2026-08-10T00:52:01.1790553Z ##[endgroup]
2026-08-10T00:52:01.3576691Z (node:9443) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
2026-08-10T00:52:01.3578738Z (Use `node --trace-deprecation ...` to show where the warning was created)
2026-08-10T00:52:01.3681851Z Multiple search paths detected. Calculating the least common ancestor of all paths
2026-08-10T00:52:01.3693235Z The least common ancestor is /home/runner/work/dya-studio/dya-studio/e2e/renode. This will be the root directory of the artifact
2026-08-10T00:52:01.3695039Z With the provided path, there will be 2 files uploaded
2026-08-10T00:52:01.3734137Z Artifact name is valid!
2026-08-10T00:52:01.3734944Z Root directory input is valid!
2026-08-10T00:52:01.5032334Z Beginning upload of artifact content to blob storage
2026-08-10T00:52:01.5253374Z (node:9443) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized and prone to errors that have security implications. Use the WHATWG URL API instead. CVEs are not issued for `url.parse()` vulnerabilities.
2026-08-10T00:52:01.5549081Z Uploaded bytes 495
2026-08-10T00:52:01.5698212Z Finished uploading artifact content to blob storage!
2026-08-10T00:52:01.5699504Z SHA256 digest of uploaded artifact zip is 99043cd883c66dfddc9d32458718897068ce020019af06312ab73465ad5a73d9
2026-08-10T00:52:01.5701364Z Finalizing artifact upload
2026-08-10T00:52:01.7167188Z Artifact playwright-artifacts-dya2-nonsplit-unlocked.zip successfully finalized. Artifact ID 9047206114
2026-08-10T00:52:01.7180490Z Artifact playwright-artifacts-dya2-nonsplit-unlocked has been successfully uploaded! Final size is 495 bytes. Artifact ID is 9047206114
2026-08-10T00:52:01.7184085Z Artifact download URL: https://github.com/bakajaan/dya-studio/actions/runs/31344272430/artifacts/9047206114
2026-08-10T00:52:01.7382942Z Node 20 is being deprecated. This workflow is running with Node 24 by default. If you need to temporarily use Node 20, you can set the ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION=true environment variable. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
2026-08-10T00:52:01.7384215Z Post job cleanup.
2026-08-10T00:52:01.8297532Z [command]/usr/bin/git version
2026-08-10T00:52:01.8334277Z git version 2.54.0
2026-08-10T00:52:01.8410123Z Temporarily overriding HOME='/home/runner/work/_temp/1e60d22f-9217-4098-96bd-79231e805b72' before making global git config changes
2026-08-10T00:52:01.8412453Z Adding repository directory to the temporary git global config as a safe directory
2026-08-10T00:52:01.8417672Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/dya-studio/dya-studio/zmk-west-commands
2026-08-10T00:52:01.8463515Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-08-10T00:52:01.8507959Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-08-10T00:52:01.8782228Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-08-10T00:52:01.8803203Z http.https://github.com/.extraheader
2026-08-10T00:52:01.8816016Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-08-10T00:52:01.8856989Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-08-10T00:52:01.9115523Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-08-10T00:52:01.9162873Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-08-10T00:52:01.9624635Z Post job cleanup.
2026-08-10T00:52:02.0502626Z [command]/usr/bin/git version
2026-08-10T00:52:02.0549424Z git version 2.54.0
2026-08-10T00:52:02.0591339Z Temporarily overriding HOME='/home/runner/work/_temp/5c832f4b-ae59-4681-bc49-243544cce9dd' before making global git config changes
2026-08-10T00:52:02.0592841Z Adding repository directory to the temporary git global config as a safe directory
2026-08-10T00:52:02.0598476Z [command]/usr/bin/git config --global --add safe.directory /home/runner/work/dya-studio/dya-studio
2026-08-10T00:52:02.0642841Z [command]/usr/bin/git config --local --name-only --get-regexp core\.sshCommand
2026-08-10T00:52:02.0679869Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'core\.sshCommand' && git config --local --unset-all 'core.sshCommand' || :"
2026-08-10T00:52:02.0941761Z [command]/usr/bin/git config --local --name-only --get-regexp http\.https\:\/\/github\.com\/\.extraheader
2026-08-10T00:52:02.0970121Z http.https://github.com/.extraheader
2026-08-10T00:52:02.0983663Z [command]/usr/bin/git config --local --unset-all http.https://github.com/.extraheader
2026-08-10T00:52:02.1024795Z [command]/usr/bin/git submodule foreach --recursive sh -c "git config --local --name-only --get-regexp 'http\.https\:\/\/github\.com\/\.extraheader' && git config --local --unset-all 'http.https://github.com/.extraheader' || :"
2026-08-10T00:52:02.1282303Z [command]/usr/bin/git config --local --name-only --get-regexp ^includeIf\.gitdir:
2026-08-10T00:52:02.1348925Z [command]/usr/bin/git submodule foreach --recursive git config --local --show-origin --name-only --get-regexp remote.origin.url
2026-08-10T00:52:02.1792557Z Cleaning up orphan processes
2026-08-10T00:52:02.2121469Z ##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@v4, actions/download-artifact@v4, actions/upload-artifact@v4. For more information see: https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/
```
