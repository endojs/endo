/* global process, fetch */
/**
 * Downloads a Node.js binary for the target platform into
 * packages/familiar/binaries/.
 *
 * Usage: node scripts/download-node.mjs [node-version] [target-os] [target-arch]
 * Defaults to current platform when target-os and target-arch are not specified.
 *
 * Cross-platform: works on macOS, Linux, and Windows.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const binariesDir = path.resolve(dirname, '..', 'binaries');

const nodeVersion = process.argv[2] || 'v20.18.1';

// Determine target OS.
// Node.js dist uses "win" for Windows, "darwin" for macOS, "linux" for Linux.
const hostOS = process.platform === 'win32' ? 'win' : process.platform;
const targetOS = process.argv[3] || hostOS;

// Determine target arch.
const archMap = { x64: 'x64', arm64: 'arm64' };
const hostArch = archMap[process.arch];
if (!hostArch && !process.argv[4]) {
  console.error(`Unsupported architecture: ${process.arch}`);
  process.exit(1);
}
const targetArch = process.argv[4] || hostArch;

const isWindows = targetOS === 'win';
const binaryName = `node-${targetOS}-${targetArch}`;
const dest = path.join(
  binariesDir,
  isWindows ? `${binaryName}.exe` : binaryName,
);

if (fs.existsSync(dest)) {
  console.log(`Already exists: ${dest}`);
  process.exit(0);
}

fs.mkdirSync(binariesDir, { recursive: true });

const archiveName = isWindows
  ? `node-${nodeVersion}-${targetOS}-${targetArch}.zip`
  : `node-${nodeVersion}-${targetOS}-${targetArch}.tar.gz`;
const url = `https://nodejs.org/dist/${nodeVersion}/${archiveName}`;

console.log(
  `Downloading Node.js ${nodeVersion} for ${targetOS}-${targetArch}...`,
);

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-node-'));

try {
  const archivePath = path.join(tmpDir, archiveName);

  // Download using fetch (Node 20+).
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed: ${res.status} ${res.statusText} ${url}`);
  }
  const fileStream = fs.createWriteStream(archivePath);
  await pipeline(res.body, fileStream);

  // Extract.
  const extractDir = path.join(tmpDir, 'extracted');
  fs.mkdirSync(extractDir, { recursive: true });

  if (isWindows) {
    // Windows .zip — tar on Windows 10+ can extract zip files.
    execFileSync('tar', ['-xf', archivePath, '-C', extractDir]);
  } else {
    execFileSync('tar', ['-xzf', archivePath, '-C', extractDir]);
  }

  // Locate the binary inside the extracted archive.
  const innerDir = `node-${nodeVersion}-${targetOS}-${targetArch}`;
  const srcBinary = isWindows
    ? path.join(extractDir, innerDir, 'node.exe')
    : path.join(extractDir, innerDir, 'bin', 'node');

  fs.copyFileSync(srcBinary, dest);

  if (!isWindows) {
    fs.chmodSync(dest, 0o755);
  }

  console.log(`Installed: ${dest}`);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
