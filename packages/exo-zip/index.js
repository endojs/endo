// @ts-check

// Surface module: re-exports the public adapter from the source tree.
// `zip` is the only public entry; internal helpers
// (`walkTree`, `drainBase64`) stay inside `./src/zip.js` so the
// public surface cannot drift by accident.

export { zip } from './src/zip.js';
