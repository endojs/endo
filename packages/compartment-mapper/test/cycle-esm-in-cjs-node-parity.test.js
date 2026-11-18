/**
 * Node.js parity test for the ESM-in-CommonJS-cycle divergence scenario.
 * This test runs the same fixture under plain Node.js (no SES, no
 * compartment mapper) and asserts that Node.js rejects the topology with
 * ERR_REQUIRE_CYCLE_MODULE. The companion compartment-mapper / SES test
 * in cycle-esm-in-cjs.test.js asserts the divergent behavior: SES allows
 * the same fixture to load and exposes the cycle's snapshot / live-binding
 * shape on the namespace. Together the two tests verify the divergence
 * programmatically rather than narratively.
 */

import test from 'ava';
import process from 'process';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

test('ESM-in-CJS-cycle - node parity (rejects with ERR_REQUIRE_CYCLE_MODULE)', t => {
  t.plan(2);
  const fixture = new URL(
    'fixtures-cycle-esm-in-cjs/node_modules/app/main.mjs',
    import.meta.url,
  );
  // Spawn a fresh Node process to execute the fixture. The expected outcome
  // is a non-zero exit with the ERR_REQUIRE_CYCLE_MODULE error code printed
  // on stderr. Spawning isolates the failure from the test runner's own
  // module graph and keeps the rest of the suite running.
  const result = spawnSync(process.execPath, [fileURLToPath(fixture)], {
    encoding: 'utf8',
  });
  t.not(
    result.status,
    0,
    `Expected Node to reject ESM-in-CJS-cycle, got exit ${result.status}`,
  );
  t.regex(
    result.stderr,
    /ERR_REQUIRE_CYCLE_MODULE/,
    `Expected ERR_REQUIRE_CYCLE_MODULE in stderr, got:\n${result.stderr}`,
  );
});
