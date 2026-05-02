/**
 * Node.js parity test for conditional subpath patterns with a user-specified
 * condition.
 *
 * This test runs under --conditions=blue-moon (configured via ses-ava in
 * test/_ava-node-condition.config.js). It verifies that Node.js selects the
 * "blue-moon" branch of a conditional pattern, confirming parity with the
 * Compartment Mapper test in subpath-patterns.test.js.
 */
import test from 'ava';
import { assertConditionalBlue } from './_subpath-patterns-assertions.js';

const fixtureBase = new URL(
  'fixtures-package-imports-exports/node_modules/app/',
  import.meta.url,
);

test('conditional pattern selects user-specified condition in Node.js', async t => {
  // With --conditions=blue-moon, "blue-moon" is selected over "default".
  const ns = await import(new URL('conditional-import.js', fixtureBase).href);
  assertConditionalBlue(t, ns);
});
