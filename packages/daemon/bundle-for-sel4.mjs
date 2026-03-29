// Bundle daemon.js for seL4 via a minimal wrapper entry point.
// Run: cd packages/daemon && node bundle-for-sel4.mjs

import '@endo/init/debug.js';

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

const { makeBundle } = await import('@endo/compartment-mapper/bundle.js');

// Use the thin entry point that excludes libp2p/network deps.
const entryFile = path.resolve('sel4-entry.js');
if (!fs.existsSync(entryFile)) {
  console.error('Cannot find sel4-entry.js');
  process.exit(1);
}

console.log('Entry:', entryFile);

const read = async (location) => {
  return fs.promises.readFile(fileURLToPath(location));
};

console.log('Bundling (excluding node conditions)...');
try {
  const bundle = await makeBundle(
    read,
    pathToFileURL(entryFile).toString(),
    {
      // Exclude "node" condition to avoid fs-node paths.
      conditions: new Set(['default', 'endo']),
    },
  );

  const localOutput = path.resolve('daemon-bundle.js');
  await fs.promises.writeFile(localOutput, bundle, 'utf-8');

  const stats = await fs.promises.stat(localOutput);
  console.log('Written:', localOutput);
  console.log('Size:', Math.round(stats.size / 1024), 'KB');
  console.log('Lines:', bundle.split('\n').length);
} catch (e) {
  console.error('Bundling failed:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
