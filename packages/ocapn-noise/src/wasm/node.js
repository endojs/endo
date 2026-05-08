// @ts-check

/**
 * Node.js loader for the bundled Noise WASM module.
 *
 * Resolves the path from this file's own URL so the package works
 * regardless of how it is installed (yarn workspaces, npm, pnpm with
 * symlinks, etc.). A separate module under a `default`/`browser`
 * conditional export can supply a `fetch`-based loader for browsers
 * without touching `network.js`.
 */

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { getRandomValues as nodeGetRandomValues } from 'node:crypto';

const wasmPath = fileURLToPath(
  new URL('../../gen/ocapn-noise.wasm', import.meta.url),
);
const wasmBytes = /** @type {Uint8Array<ArrayBuffer>} */ (
  readFileSync(wasmPath)
);

export const wasmModule = new WebAssembly.Module(wasmBytes);

/** @param {Uint8Array} array */
export const getRandomValues = array => {
  nodeGetRandomValues(array);
};
