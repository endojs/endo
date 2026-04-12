/* global process */
/**
 * Prepares the familiar package directory for electron-forge packaging.
 * Copies the correct Node binary and chat dist into the package.
 *
 * Usage: node scripts/prepare-package.mjs [target-os] [target-arch]
 * Defaults to current platform if not specified.
 *
 * Cross-platform: works on macOS, Linux, and Windows.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const familiarDir = path.resolve(dirname, '..');
const repoRoot = path.resolve(familiarDir, '../..');

// Determine target OS.
const hostOS = process.platform === 'win32' ? 'win' : process.platform;
const targetOS = process.argv[2] || hostOS;

// Determine target arch.
const archMap = { x64: 'x64', arm64: 'arm64' };
const hostArch = archMap[process.arch];
if (!hostArch && !process.argv[3]) {
  console.error(`Unsupported architecture: ${process.arch}`);
  process.exit(1);
}
const targetArch = process.argv[3] || hostArch;

const isWindows = targetOS === 'win';

// Copy Node binary.
const binaryName = `node-${targetOS}-${targetArch}`;
const srcBinary = path.join(
  familiarDir,
  'binaries',
  isWindows ? `${binaryName}.exe` : binaryName,
);

if (!fs.existsSync(srcBinary)) {
  console.error(`Error: Node binary not found at ${srcBinary}`);
  console.error('Run node scripts/download-node.mjs first.');
  process.exit(1);
}

const destName = isWindows ? 'node.exe' : 'node';
const destBinary = path.join(familiarDir, destName);
console.log(`Copying Node binary: ${path.basename(srcBinary)} -> ${destName}`);
fs.copyFileSync(srcBinary, destBinary);

if (!isWindows) {
  fs.chmodSync(destBinary, 0o755);
}

// Copy chat dist.
const chatDist = path.join(repoRoot, 'packages/chat/dist');

if (!fs.existsSync(chatDist)) {
  console.error(`Error: Chat dist not found at ${chatDist}`);
  console.error("Run 'yarn workspace @endo/chat build' first.");
  process.exit(1);
}

const destChatDir = path.join(familiarDir, 'dist/chat');
console.log('Copying chat dist...');
fs.cpSync(chatDist, destChatDir, { recursive: true });

console.log('Package preparation complete.');
