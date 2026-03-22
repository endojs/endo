/**
 * Compartment Mapper test for subpath pattern replacement.
 *
 * Uses the scaffold harness to exercise the fixture through all execution
 * paths (loadLocation, importLocation, makeArchive, parseArchive, etc.).
 *
 * The expected values match those asserted in node-parity-subpath-patterns.test.js,
 * so if both tests pass, the Compartment Mapper has parity with Node.js for
 * these cases.
 */
import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-subpath-patterns/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 5;

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  t.is(namespace.alpha, 'alpha');
  t.is(namespace.betaGamma, 'beta-gamma');
  t.is(namespace.exact, 'exact-match');
  t.is(namespace.helper, 'helper');
  t.is(namespace.specificity, 'specific');
};

scaffold(
  'subpath-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
