#!/usr/bin/env node
/**
 * @file Build a publishable .tgz for every public workspace.
 *
 * The flow:
 *   1. `git clean -fX -e node_modules` — wipe ignored artifacts (stale .d.ts,
 *      coverage, etc.) so `tsc --build` can't hit TS5055 "would overwrite input
 *      file" and so tarballs always reflect the current source tree.
 *   2. `yarn build` — runs the real per-workspace build scripts.  Only `ses`
 *      does substantive work (producing `dist/ses.cjs` and friends); every
 *      other package has `build: exit 0`.
 *   3. `yarn build:types` — composite `tsc --build tsconfig.composite.json`,
 *      emits `.d.ts` for every workspace in dependency order.  `tsconfig.
 *      composite.json` files are git-tracked so step 1 does not remove them.
 *   4. `yarn workspaces foreach --all --no-private pack --out <abs distDir>/
 *      %s-%v.tgz` — pack every public workspace.  The `--out` path must be
 *      absolute: `foreach` changes cwd per workspace, so a relative path would
 *      scatter tarballs into each package's own dist/.  `workspace:` specifiers are
 *      resolved by Yarn natively; `catalog:` specifiers are not used in runtime
 *      deps (only devDependencies), so they never appear in published tarballs.
 *   5. Creates `dist/` dir if missing.
 *   6. `git clean -fX -e node_modules -e /dist` — restore pristine source tree
 *      while preserving the tarballs in the repo-root `dist/`.  The anchored
 *      `-e /dist` leaves only the top-level `dist/` intact.
 *
 * Freshness guarantee: `dist/` is recursively removed before step 4, so there
 * is no way for a previous run's stale or partial output to survive.  Combined
 * with `release-npm.mjs` invoking this script unconditionally before publish,
 * the published tarballs are always a function of the current source tree.
 *
 * Used by:
 *   - `yarn pack:all` (dev / CI smoke)
 *   - `yarn release:npm` (publish flow, via release-npm.mjs)
 *   - `scripts/files.sh` (file inventory)
 *   - `scripts/compare-pack.mjs` (new-vs-legacy tarball diff)
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

/**
 * @import {SpawnOptions} from 'node:child_process';
 */

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname);
const distDir = path.join(repoRoot, 'dist');

/**
 * Run a command, inheriting stdio; reject on non-zero exit.
 * @param {string} cmd
 * @param {string[]} argv
 * @param {SpawnOptions} [options]
 */
const run = (cmd, argv, options) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, argv, { stdio: 'inherit', ...options });
    child.once('error', reject);
    child.once('exit', code =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)),
    );
  });

console.error('pack-all: step 1 — git clean -fX');
await run('git', ['clean', '-fX', '-e', 'node_modules'], { cwd: repoRoot });

console.error('pack-all: step 2 — yarn build');
await run('yarn', ['build'], { cwd: repoRoot });

console.error('pack-all: step 3 — yarn build:types');
await run('yarn', ['build:types'], { cwd: repoRoot });

// prep dist dir
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

console.error('pack-all: step 4 — yarn workspaces foreach pack');
// The --out path MUST be absolute: foreach changes cwd per workspace, so a
// relative path would drop tarballs into packages/*/dist/ instead of root
// dist/.
//
// NOTE: Yarn's special template variable `%s` is the package name _verbatim_,
// so any package with an `@endo` scope will be named e.g.,
// `@endo-<name>-<version>.tgz`. This diverges from npm's behavior, which is to
// omit the leading `@`.
const outTemplate = path.join(distDir, '%s-%v.tgz');
await run(
  'yarn',
  [
    'workspaces',
    'foreach',
    '--all',
    '--no-private',
    'pack',
    '--out',
    outTemplate,
  ],
  { cwd: repoRoot },
);

const tarballs = readdirSync(distDir)
  .filter(name => name.endsWith('.tgz'))
  .sort();

console.error('pack-all: step 6 — git clean -fX (preserving dist/)');
await run('git', ['clean', '-fX', '-e', 'node_modules', '-e', '/dist'], {
  cwd: repoRoot,
});

// ── Done ─────────────────────────────────────────────────────────────────────

for (const name of tarballs) {
  console.error(
    `pack-all: wrote ${path.relative(process.cwd(), path.join(distDir, name))}`,
  );
}
console.error(
  `\npack-all: wrote ${tarballs.length} tarball(s) in ${path.relative(repoRoot, distDir)}/`,
);
