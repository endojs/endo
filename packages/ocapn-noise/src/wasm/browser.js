// @ts-check
/* global globalThis, fetch */

/**
 * Browser (and generic `default`) loader for the Noise WASM module.
 *
 * Resolves the `.wasm` asset via `import.meta.url` so bundlers with
 * asset-URL support (Vite, Webpack 5+, Parcel, ESM-native CDNs) emit
 * the `.wasm` alongside the JS and return a working URL at runtime.
 * Compiles eagerly at import time using `WebAssembly.compileStreaming`
 * with a fallback to `fetch`+`arrayBuffer`+`compile` for hosts that
 * lack streaming compilation (older Safari, some embedded runtimes).
 *
 * Randomness uses the Web Crypto API, which every browser and every
 * standards-conformant JS runtime exposes.
 */

const wasmUrl = new URL('../../gen/ocapn-noise.wasm', import.meta.url);

/** @returns {Promise<WebAssembly.Module>} */
const loadModule = async () => {
  await null;
  const response = await fetch(wasmUrl);
  if (WebAssembly.compileStreaming) {
    return WebAssembly.compileStreaming(response);
  }
  const bytes = await response.arrayBuffer();
  return WebAssembly.compile(bytes);
};

// Top-level await is intentional: bundlers and browser module graphs
// wait for this module to resolve before `network.js` sees
// `wasmModule`. No way to avoid the first-await-at-top-level here.
// eslint-disable-next-line @jessie.js/safe-await-separator
export const wasmModule = await loadModule();

/** @param {Uint8Array<ArrayBuffer>} array */
export const getRandomValues = array => {
  globalThis.crypto.getRandomValues(array);
};
