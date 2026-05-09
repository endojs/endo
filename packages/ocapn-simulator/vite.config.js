import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');

// `@endo/ocapn` imports `randomBytes` from `node:crypto`. In the
// browser we redirect that to a tiny WebCrypto-based shim.
const cryptoShim = resolve(here, 'src/shims/node-crypto.js');

export default defineConfig({
  root: here,
  resolve: {
    alias: {
      'node:crypto': cryptoShim,
      crypto: cryptoShim,
    },
  },
  optimizeDeps: {
    // Pre-bundle to avoid a refresh storm in dev as the many small files
    // in @endo/ocapn are first crawled.
    include: [
      '@endo/eventual-send',
      '@endo/harden',
      '@endo/init/debug.js',
      '@endo/marshal',
      '@endo/ocapn',
    ],
  },
  worker: {
    format: 'es',
  },
  server: {
    fs: {
      // Allow vite to serve files from the workspace (yarn pnpm linker
      // resolves @endo/* into ../../node_modules and the package
      // sources live in ../../packages/*).
      allow: [root],
    },
  },
});
