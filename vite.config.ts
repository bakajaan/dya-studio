import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";

function htmlEnvVarReplacePlugin(env: Record<string, string>): Plugin {
  return {
    name: "html-transform",
    transformIndexHtml: {
      order: "pre",
      handler: (html: string): string =>
        html.replace(/%(.*?)%/g, (match, p1) => env[p1] ?? match),
    },
  };
}

/**
 * Vite plugin that patches `call_rpc` in @zmkfirmware/zmk-studio-ts-client
 * to wrap writer.releaseLock() and reader.releaseLock() in try/finally blocks,
 * and adds a watchdog around the response read so a non-responding device
 * can never wedge the shared rpcMutex forever.
 *
 * Root cause (try/finally, fixed first):
 *   If writer.write() or reader.read() throws (e.g. BLE GATT disconnect, USB
 *   serial glitch), releaseLock() is never called because neither call is inside
 *   a finally block. The WritableStream / ReadableStream lock persists even after
 *   the rpcMutex releases, so every subsequent call_rpc invocation fails with
 *   "WritableStream is locked" / "ReadableStream is locked".
 *
 * Root cause (watchdog, added after further investigation):
 *   Even with the try/finally fix, a call whose response never arrives (e.g.
 *   the caller's own outer timeout gives up while the underlying call_rpc
 *   invocation is still awaiting reader.read()) leaves call_rpc awaiting
 *   forever, holding rpcMutex the whole time. Any later call_rpc invocation
 *   (e.g. triggered by switching tabs, which mounts a component that
 *   immediately issues a new custom-subsystem request) then queues behind
 *   that mutex and can surface as "GATT operation failed for unknown reason"
 *   once it finally runs, because the underlying BLE stack timing no longer
 *   lines up with the JS-level wait. Racing reader.read() against a 35s
 *   watchdog and releasing the lock on timeout bounds the worst case to a
 *   finite hang instead of an indefinite one.
 *
 *   Trade-off: forcibly releasing a still-pending read causes the Streams
 *   spec to reject that pending read, but the physical device response (if
 *   it arrives later) is still the next item in the shared response stream.
 *   If a *subsequent* call_rpc consumes it, that subsequent call may see a
 *   one-time "Mismatch request IDs" error -- already handled by existing
 *   error handling -- after which the stream is back in sync. This is a
 *   strict improvement over an indefinite hang. 35s is intentionally longer
 *   than the app's own custom-subsystem timeout (30s, see
 *   useCustomSubsystem.ts) so this watchdog never cuts off a call the app
 *   itself would still be willing to wait for; it only acts as a backstop
 *   for calls the app has already given up on.
 *
 * This transform runs at Vite build time (dev + prod). If the regex pattern is
 * not found (e.g. after a library update changes the compiled output), a warning
 * is printed but the build does NOT fail — the code just runs without the patch.
 * Revisit if the library is updated.
 *
 * Upstream source: zmk-studio-ts-client/src/index.ts  call_rpc()
 */
function patchCallRpcFinally(): Plugin {
  return {
    name: "patch-call-rpc-finally",
    transform(code, id) {
      // Only process the ts-client index module
      if (!id.includes("zmk-studio-ts-client")) return null;
      if (!id.endsWith("index.js") && !id.endsWith("index.ts")) return null;

      // Quick sanity-check: if neither stream field is referenced, this is not
      // the call_rpc file (e.g. it could be another index from a different pkg).
      if (
        !code.includes("request_writable") ||
        !code.includes("request_response_readable")
      ) {
        return null;
      }

      let patched = code;
      let anyMatched = false;

      // -----------------------------------------------------------------
      // Fix 1: writer.releaseLock() → try/finally
      //
      // Original (compiled JS from src/index.ts):
      //   let writer = conn.request_writable.getWriter();
      //   await writer.write(request);
      //   writer.releaseLock();
      //
      // Fixed:
      //   let writer = conn.request_writable.getWriter();
      //   try {
      //       await writer.write(request);
      //   } finally {
      //       writer.releaseLock();
      //   }
      // -----------------------------------------------------------------
      {
        const before = patched;
        patched = patched.replace(
          /let writer = conn\.request_writable\.getWriter\(\);\s*await writer\.write\(request\);\s*writer\.releaseLock\(\);/,
          [
            "let writer = conn.request_writable.getWriter();",
            "        try {",
            "            await writer.write(request);",
            "        } finally {",
            "            writer.releaseLock();",
            "        }",
          ].join("\n"),
        );
        if (patched !== before) anyMatched = true;
      }

      // -----------------------------------------------------------------
      // Fix 2: reader.releaseLock() → try/finally
      //
      // Original (compiled JS from src/index.ts):
      //   let reader = conn.request_response_readable.getReader();
      //   let { done, value } = await reader.read();
      //   reader.releaseLock();
      //
      // Fixed:
      //   let reader = conn.request_response_readable.getReader();
      //   let done, value;
      //   try {
      //       ({ done, value } = await reader.read());
      //   } finally {
      //       reader.releaseLock();
      //   }
      //
      // Note: `done` and `value` are hoisted outside the try block so they
      // remain accessible to the post-finally error-checking code.
      // -----------------------------------------------------------------
      {
        const before = patched;
        patched = patched.replace(
          /let reader = conn\.request_response_readable\.getReader\(\);\s*let \{ done, value \} = await reader\.read\(\);\s*reader\.releaseLock\(\);/,
          [
            "let reader = conn.request_response_readable.getReader();",
            "        let done, value;",
            "        try {",
            "            ({ done, value } = await reader.read());",
            "        } finally {",
            "            reader.releaseLock();",
            "        }",
          ].join("\n"),
        );
        if (patched !== before) anyMatched = true;
      }

      // -----------------------------------------------------------------
      // Fix 3: bound the response read with a watchdog so a non-responding
      // device can never hold rpcMutex forever.
      //
      // Turns:
      //   ({ done, value } = await reader.read());
      // into:
      //   ({ done, value } = await __rpcReadWithWatchdog(reader, 35000));
      //
      // On timeout, __rpcReadWithWatchdog rejects; the surrounding finally
      // (from Fix 2) still calls reader.releaseLock(), which per the Streams
      // spec forcibly rejects the now-abandoned pending read, freeing the
      // reader/mutex for the next queued call_rpc invocation. See the
      // plugin-level doc comment above for the accepted trade-off.
      // -----------------------------------------------------------------
      {
        const before = patched;
        patched = patched.replace(
          "await reader.read())",
          "await __rpcReadWithWatchdog(reader, 35000))",
        );
        if (patched !== before) anyMatched = true;
      }

      if (!anyMatched) {
        // Pattern not matched — warn loudly but do not fail the build.
        // The library will function without the fix (existing behaviour).
        // This can happen if the upstream library is updated and the compiled
        // output format changes; check lib/index.js and update the regex.
        console.warn(
          "[patch-call-rpc-finally] WARNING: Patch pattern not matched in " +
            id +
            ".\n" +
            "  The call_rpc try/finally + watchdog fix was NOT applied.\n" +
            "  'WritableStream is locked' / 'GATT Server is disconnected' /" +
            " 'GATT operation failed' errors may recur after transport errors.\n" +
            "  Check the compiled lib/index.js and update the regex in vite.config.ts.",
        );
        return null;
      }

      // Inject the watchdog helper once. Appended at the end of the module
      // (function declarations hoist, so call sites earlier in the file can
      // still reference it) to avoid inserting code before any leading
      // import statements.
      if (!patched.includes("function __rpcReadWithWatchdog")) {
        patched += `
function __rpcReadWithWatchdog(reader, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("RPC response timed out after " + timeoutMs + "ms; releasing mutex"));
    }, timeoutMs);
    reader.read().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
`;
      }

      console.log(
        "[patch-call-rpc-finally] call_rpc patched (try/finally + watchdog) in " +
          id,
      );
      return { code: patched, map: null };
    },
  };
}

/**
 * Vite plugin that patches the BLE GATT transport in
 * @zmkfirmware/zmk-studio-ts-client (src/transport/gatt.ts) to retry a
 * write when the browser throws "GATT operation failed for unknown reason".
 *
 * Root cause:
 *   This is a known, well-documented Web Bluetooth quirk (most common on
 *   Windows): the OS Bluetooth stack occasionally fails a single GATT
 *   write/read with no more specific reason, even when there is no literal
 *   overlapping operation in our own JS code -- e.g. right after a call_rpc
 *   invocation is abandoned/cleaned up (see patchCallRpcFinally's watchdog)
 *   and a new one starts immediately after (such as when switching tabs
 *   while a request is in flight). The failure is transient: retrying the
 *   same write shortly after typically succeeds.
 *
 * Fix:
 *   Wrap char.writeValueWithoutResponse(...) and char.writeValue(...) in a
 *   small retry helper that retries up to 2 extra times (3 attempts total)
 *   with a short backoff, but only for errors matching "GATT operation
 *   failed"; any other error (e.g. a real disconnect) is rethrown
 *   immediately without retrying. Each retried write chunk has not yet
 *   succeeded, so retrying is safe and does not duplicate data.
 *
 * This transform runs at Vite build time (dev + prod). If the regex pattern is
 * not found (e.g. after a library update changes the compiled output), a warning
 * is printed but the build does NOT fail — the code just runs without the patch.
 *
 * Upstream source: zmk-studio-ts-client/src/transport/gatt.ts
 */
function patchGattRetry(): Plugin {
  return {
    name: "patch-gatt-retry",
    transform(code, id) {
      if (!id.includes("zmk-studio-ts-client")) return null;
      if (!id.toLowerCase().includes("gatt")) return null;
      if (
        !code.includes("writeValueWithoutResponse") &&
        !code.includes("writeValue(")
      ) {
        return null;
      }

      let patched = code;
      let anyMatched = false;

      {
        const before = patched;
        patched = patched.replace(
          "return await char.writeValueWithoutResponse(chunk);",
          "return await __gattRetry(() => char.writeValueWithoutResponse(chunk));",
        );
        if (patched !== before) anyMatched = true;
      }

      {
        const before = patched;
        patched = patched.replace(
          "await char.writeValue(slice);",
          "await __gattRetry(() => char.writeValue(slice));",
        );
        if (patched !== before) anyMatched = true;
      }

      if (!anyMatched) {
        console.warn(
          "[patch-gatt-retry] WARNING: Patch pattern not matched in " +
            id +
            ".\n" +
            "  The GATT write retry fix was NOT applied.\n" +
            "  'GATT operation failed for unknown reason' errors may recur.\n" +
            "  Check the compiled lib/transport/gatt.js and update the regex in vite.config.ts.",
        );
        return null;
      }

      if (!patched.includes("function __gattRetry")) {
        patched += `
async function __gattRetry(fn, retries = 2, delayMs = 200) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e && e.message ? e.message : String(e);
      if (!/GATT operation failed/i.test(msg) || attempt === retries) {
        throw e;
      }
      console.warn(
        "[patch-gatt-retry] Transient GATT error, retrying (" +
          (attempt + 1) +
          "/" +
          retries +
          "):",
        msg,
      );
      await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
    }
  }
  throw lastErr;
}
`;
      }

      console.log("[patch-gatt-retry] GATT write retry patched in " + id);
      return { code: patched, map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      // Apply ts-client patches before any other plugin transforms the module.
      // Place them first so they run on the raw compiled JS from node_modules.
      patchCallRpcFinally(),
      patchGattRetry(),
      tailwindcss(),
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      svgr(),
      htmlEnvVarReplacePlugin({
        VITE_GOOGLE_ANALYTICS_ID:
          env.VITE_GOOGLE_ANALYTICS_ID || "G-32NGG9Y4BQ",
      }),
    ],
  };
});
