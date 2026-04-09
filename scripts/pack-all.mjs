#!/usr/bin/env node
/**
 * @file Build a publishable .tgz for every public workspace using ts-node-pack.
 *
 * Yarn 4 does not support swapping the pack engine, so we drive ts-node-pack
 * directly. Each tarball is written to `dist/` at the workspace root, named
 * `<scope>-<name>-<version>.tgz`. Pre-existing tarballs are overwritten so
 * repeated runs are deterministic.
 *
 * Used by:
 *   - `yarn pack:all` (dev / CI smoke)
 *   - `yarn release:npm` (publish flow, via release-npm.mjs)
 *   - `scripts/files.sh` (file inventory)
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const distDir = path.join(repoRoot, 'dist');

const { stdout: binStdout } = await execFileAsync(
  'yarn',
  ['bin', 'ts-node-pack'],
  { cwd: repoRoot, maxBuffer: 1024 * 1024 },
);
const tsNodePackBin = binStdout.trim().split('\n').pop();
if (!tsNodePackBin || !existsSync(tsNodePackBin)) {
  throw new Error(`ts-node-pack binary not found (got "${tsNodePackBin}")`);
}

// `npm query` doesn't see Yarn 4 pnpm-linked workspaces; use Yarn directly.
// Output is one JSON object per line (NDJSON), not a JSON array.
const { stdout: listStdout } = await execFileAsync(
  'yarn',
  ['workspaces', 'list', '--json', '--no-private'],
  { cwd: repoRoot, maxBuffer: 16 * 1024 * 1024 },
);
/** @type {{location: string, name: string}[]} */
const workspaces = listStdout
  .split('\n')
  .filter(line => line.trim())
  .map(line => JSON.parse(line))
  // The root workspace shows up with location "."; skip it.
  .filter(ws => ws.location !== '.');

if (existsSync(distDir)) rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

/** Run a child process to completion, inheriting stdio. */
const run = (cmd, argv, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });

for (const ws of workspaces) {
  const pkgDir = path.join(repoRoot, ws.location);
  process.stderr.write(`pack-all: ${ws.name}\n`);
  await run(process.execPath, [tsNodePackBin, pkgDir], { cwd: distDir });
}

process.stderr.write(
  `\npack-all: ${workspaces.length} tarball(s) in ${path.relative(repoRoot, distDir)}/\n`,
);
