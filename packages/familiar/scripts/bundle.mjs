/**
 * Bundles the Endo CLI and daemon into self-contained ESM files
 * using esbuild for inclusion in the packaged Electron app.
 *
 * All bundles are emitted as ESM (`.mjs`) so that:
 *   - Module-level `await` (used by `manager-node.js` for SQLite
 *     migrations) survives bundling — esbuild rejects top-level
 *     await under `format: 'cjs'`.
 *   - `import.meta.url` works natively without a CJS shim.
 *   - The bundles match the rest of the workspace, which has been
 *     ESM-first since Electron 28 (we adopted Electron 42 here).
 *
 * The ESM banner injects a `createRequire` so any CJS-only deps
 * that esbuild cannot statically convert (e.g. `node-fetch`) keep
 * working through `require()`.
 */

import '@endo/init';
import fs from 'fs/promises';
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarRoot = path.resolve(dirname, '..');
const repoRoot = path.resolve(familiarRoot, '../..');

const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Re-introduce a synchronous `require` for any transitive CJS dep
  // that esbuild cannot statically convert into an ESM import.
  banner: {
    js: 'import { createRequire as __bundleCreateRequire } from "module"; const require = __bundleCreateRequire(import.meta.url);',
  },
  // Node built-ins are external by default with platform: 'node'.
  // Mark optional native deps as external to avoid build failures.
  external: ['bufferutil', 'utf-8-validate'],
  logLevel: 'info',
};

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/cli/bin/endo.cjs')],
  outfile: path.join(familiarRoot, 'bundles/endo-cli.mjs'),
});

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/daemon/src/manager-node.js')],
  outfile: path.join(familiarRoot, 'bundles/endo-daemon.mjs'),
});

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/daemon/src/worker-node.js')],
  outfile: path.join(familiarRoot, 'bundles/worker-node.mjs'),
});

await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/lal/setup.js')],
  outfile: path.join(familiarRoot, 'bundles/endo-lal-setup.mjs'),
});

// Lal agent caplet — loaded at runtime by the daemon worker via
// makeUnconfined.  lal/setup.js resolves it as
// new URL('agent.js', import.meta.url).
// Already ESM; the shared banner polyfills `require` for CJS deps
// (e.g. node-fetch) that esbuild cannot statically convert to ESM
// imports.
await build({
  ...shared,
  entryPoints: [path.join(repoRoot, 'packages/lal/agent.js')],
  outfile: path.join(familiarRoot, 'bundles/agent.js'),
});

// Copy primer directory alongside the agent bundle so that
// new URL('./primer', import.meta.url) resolves correctly.
const primerSrc = path.join(repoRoot, 'packages/lal/primer');
const primerDest = path.join(familiarRoot, 'bundles/primer');
await fs.cp(primerSrc, primerDest, { recursive: true });

await build({
  ...shared,
  entryPoints: [path.join(familiarRoot, 'electron-main.js')],
  outfile: path.join(familiarRoot, 'bundles/electron-main.mjs'),
  external: [...shared.external, 'electron'],
});

console.log('Bundles created in packages/familiar/bundles/');
