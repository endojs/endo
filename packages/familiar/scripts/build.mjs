/**
 * Runs the full Familiar build pipeline:
 *   1. Build chat dist (vite)
 *   2. Bundle Electron main-process code (esbuild)
 *   3. Download Node binary for embedding
 *   4. Prepare package (copy node binary + chat dist)
 *   5. Package with electron-forge
 *
 * Cross-platform: works on macOS, Linux, and Windows.
 */

import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarDir = path.resolve(dirname, '..');
const repoRoot = path.resolve(familiarDir, '../..');

const run = (cmd, cwd = familiarDir) =>
  execSync(cmd, { stdio: 'inherit', cwd, shell: true });

const step = label => {
  console.log('');
  console.log(`==> ${label}`);
  console.log('');
};

// 1. Chat dist
step('Building chat dist...');
run('npx vite build', path.join(repoRoot, 'packages/chat'));

// 2. Bundle
step('Bundling Electron main-process code...');
run(`node ${JSON.stringify(path.join(dirname, 'bundle.mjs'))}`);

// 3. Download Node
step('Downloading Node binary...');
run(`node ${JSON.stringify(path.join(dirname, 'download-node.mjs'))}`);

// 4. Prepare package
step('Preparing package...');
run(`node ${JSON.stringify(path.join(dirname, 'prepare-package.mjs'))}`);

// 5. Package
step('Packaging with electron-forge...');
run('npx electron-forge package');

console.log('');
console.log('Build complete. Output in packages/familiar/out/');
