// @ts-check
/* global Response, WebAssembly, fetch */

/**
 * Node-side smoke test for the browser WASM loader at
 * `src/wasm/browser.js`.
 *
 * The loader's full behavior (top-level await + `fetch(import.meta.url-relative
 * URL)` + `WebAssembly.compileStreaming`) needs a real HTTP server to
 * exercise end-to-end; that lives in `browser-test/` under
 * Playwright.  This test instead exercises the same primitive
 * sequence by hand against the committed wasm bytes:
 *
 *   1. Read `gen/ocapn-noise.wasm` from disk.
 *   2. Wrap the bytes in a `Response` (the same shape browser-side
 *      `fetch()` returns).
 *   3. Compile via `WebAssembly.compileStreaming(response)` (the
 *      streaming primitive the loader prefers) and via
 *      `WebAssembly.compile(bytes)` (the fallback the loader uses
 *      when `compileStreaming` is absent).
 *
 * If either path stops yielding a valid `WebAssembly.Module`, the
 * browser path is broken and `browser.js`'s top-level await would
 * reject at import time.
 */

import test from '@endo/ses-ava/test.js';

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const wasmPath = fileURLToPath(
  new URL('../gen/ocapn-noise.wasm', import.meta.url),
);
const wasmBytes = /** @type {Uint8Array<ArrayBuffer>} */ (
  readFileSync(wasmPath)
);

test('WebAssembly.compileStreaming works on a Response wrapping the committed wasm', async t => {
  if (typeof WebAssembly.compileStreaming !== 'function') {
    t.pass(
      'WebAssembly.compileStreaming not available in this runtime; the loader will fall through to WebAssembly.compile',
    );
    return;
  }
  const response = new Response(wasmBytes, {
    headers: { 'Content-Type': 'application/wasm' },
  });
  const mod = await WebAssembly.compileStreaming(response);
  t.true(mod instanceof WebAssembly.Module, 'compileStreaming yields a Module');

  // Spot-check that the compiled module exports the expected entry
  // points the network driver depends on.  If a future Rust change
  // accidentally drops one, this catches it before runtime.
  const exports = WebAssembly.Module.exports(mod).map(e => e.name);
  for (const name of [
    'memory',
    'buffer',
    'generate_initiator_keys',
    'generate_responder_keys',
    'initiator_write_syn',
    'initiator_read_synack',
    'responder_read_syn',
    'responder_write_synack',
    'encrypt',
    'decrypt',
  ]) {
    t.true(exports.includes(name), `wasm export ${name} present`);
  }
});

test('WebAssembly.compile fallback works on the same bytes', async t => {
  const mod = await WebAssembly.compile(wasmBytes);
  t.true(mod instanceof WebAssembly.Module, 'compile yields a Module');
});

test('fetch is callable in the runtime; a stubbed fetch returns a Response', async t => {
  // The loader's contract is `await fetch(wasmUrl)` returning
  // something Response-shaped.  A test runner could stub `fetch` to
  // serve the committed wasm without an HTTP server.  This test just
  // documents the shape; the actual stub-and-import path requires
  // unsafe lockdown (frozen globalThis cannot be reassigned), so it
  // lives in `browser-test/` rather than here.
  t.is(typeof fetch, 'function', 'fetch is a global');
  const response = new Response(wasmBytes);
  t.is(typeof response.arrayBuffer, 'function');
  // Node 18 hides webcrypto behind a flag; rather than gate the test
  // on the host's flag set, import the canonical entry point that
  // works across versions.  Browsers expose `globalThis.crypto`
  // unconditionally, which is what `wasm/browser.js` actually uses.
  const { webcrypto } = await import('node:crypto');
  t.is(typeof webcrypto.getRandomValues, 'function');
});
