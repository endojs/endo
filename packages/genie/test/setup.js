// @ts-check

/**
 * Per-test SES lockdown shim.
 *
 * Tests that pull `harden` directly from the global scope (any module
 * that does `harden({...})` without importing it) need SES lockdown to
 * have run before the import graph is resolved.  When `npx ava` runs a
 * file directly the `ses-ava` `prepare-endo.js` config hook is *not*
 * invoked, so the test files that exercise primordial-side modules (or
 * any module reachable through `src/primordial/**`) load via this
 * shim to guarantee a global `harden` is installed regardless of which
 * driver started them.
 *
 * The file has no exports — the `import '../setup.js'` side-effect at
 * the top of each test is the contract.
 */

// eslint-disable-next-line import/no-unassigned-import
import '@endo/init/debug.js';
