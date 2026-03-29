// Bundle the Endo daemon core into a single JS file for QuickJS.
//
// Must be run from the main endo repo with SES available:
//   cd ~/Documents/endo
//   node --input-type=module < packages/endo-os/sel4/build/bundle-daemon.mjs
//
// Or:
//   node -e "import('@endo/init').then(() => import('./packages/endo-os/sel4/build/bundle-daemon.mjs'))"

// Load SES lockdown first — compartment-mapper requires Compartment.
import '@endo/init/debug.js';

import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// Find daemon.js — we should be running from the main endo repo.
const daemonEntry = path.resolve('packages/daemon/src/daemon.js');
if (!fs.existsSync(daemonEntry)) {
  console.error('Cannot find:', daemonEntry);
  console.error('Run this from the main endo repo root.');
  process.exit(1);
}

console.log('Bundling:', daemonEntry);

const read = async (location) => {
  return fs.promises.readFile(fileURLToPath(location));
};

try {
  const bundle = await makeBundle(
    read,
    pathToFileURL(daemonEntry).toString(),
  );

  const outputPath = path.join(scriptDir, 'daemon-bundle.js');
  await fs.promises.writeFile(outputPath, bundle, 'utf-8');

  const stats = await fs.promises.stat(outputPath);
  console.log('Written:', outputPath);
  console.log('Size:', Math.round(stats.size / 1024), 'KB');
  console.log('Lines:', bundle.split('\n').length);
} catch (e) {
  console.error('Bundling failed:', e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
}
