// @ts-check

// Surface module: re-exports the public adapter from the source tree.
// `unzip` is the only public entry; internal helpers
// (`buildTree`, `addEntry`, `makeUnzipTree`) stay inside `./src/unzip.js` so the public surface
// cannot drift by accident. The path-segment validators live in
// `@endo/zip/path.js` and are imported by both this package and
// `@endo/exo-zip`.

export { unzip } from './src/unzip.js';
