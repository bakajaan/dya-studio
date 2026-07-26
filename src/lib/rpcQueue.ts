/**
 * Global FIFO queue for every RPC that goes out to the keyboard.
 *
 * WHY THIS EXISTS
 * ---------------
 * Several pages own independent copies of the same data hooks (e.g. both
 * {@link InsightsPage} and {@link KeymapPage} call `useKeymap()`, both
 * {@link InsightsPage} and {@link MacroComboPage} call `useRuntimeMacro()`).
 * Since tabs now stay mounted once visited (so leaving a tab no longer tears
 * down its state), two full keymap load pipelines can be in flight at the same
 * time.
 *
 * The transport library already has a shared RPC mutex, so overlapping calls do
 * not physically interleave on the wire — but custom-subsystem calls are
 * wrapped in a `withTimeout` (see {@link useCustomSubsystem}) and that timeout
 * INCLUDES the time spent waiting for the mutex. With two load pipelines
 * competing, a call can sit in the mutex queue past its timeout; when it does,
 * the timed-out call abandons the mutex mid-read, the response stream desyncs,
 * and every later call fails — which is what surfaced to the user as
 * "GATT Server is disconnected. Cannot perform GATT operations."
 *
 * 日本語: タブを常駐させた結果、キーマップ取得などの重い RPC 列が同時に2本
 * 走るようになり、ライブラリ側 mutex の待ち時間が custom subsystem の 30 秒
 * タイムアウトを食い潰していた。タイムアウトした呼び出しが mutex を途中で
 * 放棄すると応答ストリームがずれ、以降すべての RPC が壊れて最終的に GATT が
 * 切断される。
 *
 * THE FIX
 * -------
 * Admit exactly one RPC at a time from the app side, and make the waiting
 * happen HERE — before the per-call timeout starts ticking. By the time we hand
 * a call to the library, the library's mutex is free, so the timeout only ever
 * measures the actual device round-trip. Queue waiting is untimed on purpose.
 *
 * Every outbound call funnels through here:
 * - official protocol: {@link loggedCallRpc} in `./rpcLogging`
 * - custom subsystems: `callRPC` / `call` in `../hooks/useCustomSubsystem`
 *
 * IMPORTANT: never call an RPC from inside a function passed to
 * {@link enqueueRpc} — the inner call would wait for a slot the outer call is
 * still holding. Compose sequential RPCs at the call site instead (each `await`
 * takes and releases its own slot), which is what all loaders already do.
 *
 * NOTE FOR TESTS: the queue is module-level state, so it is shared by every test
 * in a file. A test that enqueues a call which never settles would otherwise
 * wedge the queue for all following tests. {@link resetRpcQueue} exists for
 * that, and `src/setupTests.ts` calls it before each test.
 */

/**
 * Safety valve so one hung call cannot wedge the queue forever. The official
 * `call_rpc` has no timeout of its own, so a call issued just as the link dies
 * could otherwise never settle and block every later RPC. Chosen well above the
 * custom-subsystem timeout (30s) so a custom call always fails on its own terms
 * first; this only frees OUR slot, it does not cancel the underlying read.
 */
export const RPC_QUEUE_SLOT_TIMEOUT_MS = 60_000;

/** Tail of the queue: resolves when the last admitted call has settled. */
let tail: Promise<void> = Promise.resolve();

/** Number of calls currently queued or running (diagnostics only). */
let pending = 0;

function ignore(): void {
  /* settle the chain regardless of the previous call's outcome */
}

/** How many RPCs are queued or in flight right now. Diagnostics only. */
export function rpcQueueDepth(): number {
  return pending;
}

/**
 * Drop the queue back to its initial state: the next call runs immediately
 * instead of waiting behind whatever was enqueued before.
 *
 * Intended for tests. Already-enqueued calls are not cancelled (we cannot
 * cancel an in-flight read); they simply stop gating new ones.
 */
export function resetRpcQueue(): void {
  tail = Promise.resolve();
  pending = 0;
}

/**
 * Reject after {@link RPC_QUEUE_SLOT_TIMEOUT_MS} so the queue keeps moving even
 * if `run()` never settles. Resolves/rejects with `run()`'s own result
 * otherwise, and clears the timer either way.
 */
function withSlotTimeout<T>(run: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      console.warn(
        `[rpc queue] a call did not settle within ${RPC_QUEUE_SLOT_TIMEOUT_MS}ms; releasing its slot`,
      );
      reject(new Error("RPC timed out"));
    }, RPC_QUEUE_SLOT_TIMEOUT_MS);

    run().then(
      (value) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        if (settled) return;
        settled = true;
        reject(err);
      },
    );
  });
}

/**
 * Run `run()` once every previously enqueued call has settled.
 *
 * Waiting for a slot is untimed (that is the whole point — see the module doc),
 * so the per-call timeout inside `run()` only measures the device round-trip.
 * A failing call never blocks the queue: the chain advances on rejection too.
 */
export function enqueueRpc<T>(run: () => Promise<T>): Promise<T> {
  pending += 1;
  const result = tail.then(
    () => withSlotTimeout(run),
    () => withSlotTimeout(run),
  );
  tail = result.then(ignore, ignore);
  return result.finally(() => {
    pending -= 1;
  });
}
