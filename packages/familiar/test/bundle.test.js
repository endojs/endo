// @ts-check

/**
 * Familiar build smoke test.
 *
 * Runs the esbuild-driven bundle pipeline from `scripts/bundle.mjs` and
 * asserts that all expected ESM artifacts are produced under
 * `bundles/`.  This is the cheapest test that catches:
 *
 *   - esbuild major-version regressions when the Familiar `esbuild`
 *     dep is bumped (e.g. the 0.24 → 0.28 jump that came alongside the
 *     Electron 40 → 42 PR).
 *   - import-time breakage in the Endo CLI, manager-node, worker-node,
 *     LAL setup, or the Familiar `electron-main.js` itself.
 *   - Silent loss of an entry point from the bundle script.
 *
 * The test does NOT require Electron to be installed; the bundle marks
 * `electron` as `external` and only resolves it as a module specifier.
 *
 * The bundle step writes ~10 MiB into `bundles/`; allow generous time.
 *
 * The bundles are emitted as ESM (`.mjs`) rather than CJS so that
 * `packages/daemon/src/manager-node.js`'s module-level `await` (since the
 * SQLite migration) survives bundling — esbuild rejects top-level
 * `await` under `format: 'cjs'`.  See `scripts/bundle.mjs` for the
 * pipeline.
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
  'endo-cli.mjs',
  'endo-daemon.mjs',
  'worker-node.mjs',
  'endo-lal-setup.mjs',
  'agent.js',
  'electron-main.mjs',
  'primer',
];

test.serial(
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
