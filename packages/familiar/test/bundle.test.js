// @ts-check
/* global process */

/**
 * Familiar build smoke test.
 *
 * Runs the esbuild-driven bundle pipeline from `scripts/bundle.mjs` and
 * asserts that all expected CJS/ESM artifacts are produced under
 * `bundles/`.  This is the cheapest test that catches:
 *
 *   - esbuild major-version regressions when the Familiar `esbuild`
 *     dep is bumped (e.g. the 0.24 → 0.28 jump that came alongside the
 *     Electron 40 → 42 PR).
 *   - import-time breakage in the Endo CLI, daemon-node, worker-node,
 *     LAL setup, or the Familiar `electron-main.js` itself.
 *   - Top-level-await regressions in modules that bundle into CJS
 *     output (esbuild rejects `await` at module scope under
 *     `format: 'cjs'`).
 *
 * The test does NOT require Electron to be installed; the bundle marks
 * `electron` as `external` and only resolves it as a module specifier.
 *
 * The bundle step writes ~10 MiB into `bundles/`; allow generous time.
 *
 * Known issue: this test currently runs as `test.serial.failing` because
 * `packages/daemon/src/daemon-node.js` uses top-level `await` (since the
 * daemon's SQLite migration), which esbuild's CJS-format output mode
 * rejects with both 0.24.x and 0.28.x.  The Familiar bundle pipeline has
 * been silently broken on master since that refactor; no CI lane
 * exercised it.  Once daemon-node.js wraps its top-level `await` in an
 * async IIFE (or the bundle script switches the daemon entry to ESM),
 * this assertion flips green and the `.failing` modifier should be
 * removed so a future regression fails CI loudly.
 *
 * See `scripts/bundle.mjs` for the bundle pipeline.
 * See `packages/daemon/src/daemon-node.js` (around line 61) for the
 * top-level `await` site that currently breaks the CJS bundle.
 */

import { execFile } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import test from 'ava';

const execFileP = promisify(execFile);

const here = dirname(fileURLToPath(import.meta.url));
const familiarRoot = dirname(here);
const bundleScript = join(familiarRoot, 'scripts', 'bundle.mjs');
const bundlesDir = join(familiarRoot, 'bundles');

/**
 * Outputs we expect from `scripts/bundle.mjs`.  Keep this list in sync
 * with the script so a silent regression that drops an entry point is
 * caught here.
 */
const expectedArtifacts = [
  'endo-cli.cjs',
  'endo-daemon.cjs',
  'worker-node.cjs',
  'endo-lal-setup.cjs',
  'agent.js',
  'electron-main.cjs',
  'primer',
];

test.serial.failing(
  'scripts/bundle.mjs builds all Familiar bundles cleanly',
  async t => {
    // The bundle pipeline shells out to esbuild four+ times and copies
    // the LAL primer tree.  Two minutes is generous on a warm cache and
    // covers a cold cache on a slow runner.
    t.timeout(120_000);

    // Start from a clean slate so a stale artifact does not mask a
    // regression in the bundle step.
    if (existsSync(bundlesDir)) {
      rmSync(bundlesDir, { recursive: true, force: true });
    }
    t.teardown(() => {
      // Leave bundles/ in place on failure so a maintainer can inspect
      // it; but do clean it on success so the test does not accumulate
      // artifacts across runs.
      if (!t.passed) return;
      try {
        rmSync(bundlesDir, { recursive: true, force: true });
        // eslint-disable-next-line no-unused-vars
      } catch (e) {
        // best-effort
      }
    });

    let stdout = '';
    let stderr = '';
    await null;
    try {
      const result = await execFileP(process.execPath, [bundleScript], {
        cwd: familiarRoot,
        env: process.env,
        maxBuffer: 32 * 1024 * 1024,
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (e) {
      const err = /** @type {Error & { stdout?: string, stderr?: string }} */ (
        e
      );
      t.fail(
        `bundle.mjs failed: ${err.message}\n` +
          `--- stdout ---\n${err.stdout ?? ''}\n` +
          `--- stderr ---\n${err.stderr ?? ''}`,
      );
      return;
    }

    // Surface the bundler's own log on failure so a regression is
    // self-explanatory in CI output.
    t.log(stdout);
    if (stderr.length > 0) t.log(stderr);

    for (const name of expectedArtifacts) {
      const artifact = join(bundlesDir, name);
      t.true(
        existsSync(artifact),
        `expected artifact ${name} missing from bundles/`,
      );
    }
  },
);
