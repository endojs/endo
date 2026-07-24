// @ts-check

/**
 * Verify that the `electron` package resolves to a runnable binary path.
 *
 * Electron 42 (per RFC #22) no longer downloads the Electron binary in a
 * `postinstall` script.  The binary is downloaded lazily the first time
 * the package is `require()`d.  This test exercises that lazy-download
 * code path and asserts the result is a real file on disk.
 *
 * The test does NOT spawn the Electron binary itself: doing so on a
 * headless Linux runner would require xvfb, libgtk-3.so.0, and the
 * other GUI shared libraries that CI runners do not have by default.
 * If a future CI lane installs those (e.g. in a `familiar-runtime`
 * job), spawning the binary with `--version` becomes the natural next
 * assertion.
 *
 * See electron/rfcs#22 for the lazy-download design rationale:
 *   https://github.com/electron/rfcs/pull/22
 */

import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';

import test from 'ava';

const requireResolve = createRequire(import.meta.url);

test.serial(
  'electron package resolves to an executable binary path',
  async t => {
    // Allow up to 4 minutes: the lazy download fetches ~100 MiB on first
    // run and may have to traverse a slow CI mirror.  Subsequent runs in
    // the same install hit the cached `path.txt` and return immediately.
    t.timeout(240_000);

    const electronPath = /** @type {string} */ (requireResolve('electron'));

    t.is(
      typeof electronPath,
      'string',
      'electron index.js must export a path string',
    );
    t.true(
      existsSync(electronPath),
      `electron binary must exist at ${electronPath}`,
    );

    // On Linux/macOS the binary must be executable; on Windows the bit
    // is meaningless so we skip that check.
    if (process.platform !== 'win32') {
      const mode = statSync(electronPath).mode;
      // eslint-disable-next-line no-bitwise
      t.not(mode & 0o111, 0, 'electron binary must have an executable bit');
    }
  },
);
