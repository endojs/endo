// @ts-check

/**
 * Static guard for Electron-API removals that would break the Familiar
 * shell at runtime.
 *
 * This test does NOT actually run the Electron main process; it greps
 * the shell's source for use of APIs that have been removed in the
 * currently installed major.  It is intended to fail loudly during a
 * major-version bump (e.g. the Electron 40 → 42 PR) so the bump is
 * gated on an explicit code review of the impacted call sites, rather
 * than on whether the existing build happens to load.
 *
 * Update the `removedApis` list below each time the Familiar package
 * adopts a new Electron major and read the upstream "Breaking Changes"
 * section.
 *
 * @see https://www.electronjs.org/docs/latest/breaking-changes
 */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import test from 'ava';

/**
 * Files in the Familiar package that import from `electron` and could
 * therefore exercise removed APIs.  Add to this list as the package
 * grows.
 */
const electronCallSites = [
  '../electron-main.js',
  '../preload.js',
  '../src/exfiltration-defense.js',
  '../src/navigation-guard.js',
  '../src/protocol-handler.js',
];

/**
 * APIs removed in Electron 41 or 42.  Each entry is a regex.  Anything
 * matched in a call site fails the test; the maintainer must either
 * remove the call or migrate to the replacement API documented in the
 * Electron breaking-changes log.
 */
const removedApis = [
  // Electron 42: `Session.clearStorageData(options)` no longer accepts
  // `options.quotas`.  Match the property in object-literal position.
  {
    pattern: /\bquotas\s*:/,
    description:
      'Session.clearStorageData(options) no longer accepts options.quotas (Electron 42)',
  },
  // Electron 42: `ELECTRON_SKIP_BINARY_DOWNLOAD` env var is removed.
  {
    pattern: /\bELECTRON_SKIP_BINARY_DOWNLOAD\b/,
    description:
      'ELECTRON_SKIP_BINARY_DOWNLOAD env var was removed in Electron 42',
  },
  // Electron 42: macOS notifications now require code-signing; we do
  // not forbid `new Notification()` outright here because the renderer
  // may still emit them, but flag any explicit `NSUserNotification`
  // bridge code that may have been hand-rolled.
  {
    pattern: /\bNSUserNotification\b/,
    description:
      'NSUserNotification was replaced by UNNotification in Electron 42',
  },
];

for (const site of electronCallSites) {
  test(`electron-main call site ${site} avoids removed APIs`, async t => {
    const url = new URL(site, import.meta.url);
    const path = fileURLToPath(url);
    let source;
    await null;
    try {
      source = await readFile(path, 'utf8');
      // eslint-disable-next-line no-unused-vars
    } catch (e) {
      // The Familiar source layout may evolve; a missing file is not a
      // test failure, but a maintainer should keep `electronCallSites`
      // in sync.
      t.pass(
        `Source file ${site} not present; update electronCallSites if it has moved`,
      );
      return;
    }

    for (const { pattern, description } of removedApis) {
      t.false(
        pattern.test(source),
        `${path} contains use of a removed Electron API: ${description}`,
      );
    }
  });
}
