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
 * to wrap writer.releaseLock() and reader.releaseLock() in try/finally blocks.
 *
 * Root cause:
 *   If writer.write() or reader.read() throws (e.g. BLE GATT disconnect, USB
 *   serial glitch), releaseLock() is never called because neither call is inside
 *   a finally block. The WritableStream / ReadableStream lock persists even after
 *   the rpcMutex releases, so every subsequent call_rpc invocation fails with
 *   "WritableStream is locked" / "ReadableStream is locked".
 *
 * Fix:
 *   Wrap both writer and reader usage in try/finally so releaseLock() is always
 *   called regardless of whether write/read succeeds or throws.
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

      if (patched === code) {
        // Pattern not matched — warn loudly but do not fail the build.
        // The library will function without the fix (existing behaviour).
        // This can happen if the upstream library is updated and the compiled
        // output format changes; check lib/index.js and update the regex.
        console.warn(
          "[patch-call-rpc-finally] WARNING: Patch pattern not matched in " +
            id +
            ".\n" +
            "  The call_rpc try/finally fix was NOT applied.\n" +
            "  'WritableStream is locked' / 'GATT Server is disconnected' errors" +
            " may recur after transport errors.\n" +
            "  Check the compiled lib/index.js and update the regex in vite.config.ts.",
        );
        return null;
      }

      console.log(
        "[patch-call-rpc-finally] call_rpc patched (try/finally) in " + id,
      );
      return { code: patched, map: null };
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    plugins: [
      // Apply call_rpc patch before any other plugin transforms the module.
      // Place it first so it runs on the raw compiled JS from node_modules.
      patchCallRpcFinally(),
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
