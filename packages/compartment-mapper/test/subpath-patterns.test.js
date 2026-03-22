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
/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-subpath-patterns/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  t.like(namespace, {
    alpha: 'alpha',
    betaGamma: 'beta-gamma',
    exact: 'exact-match',
    helper: 'helper',
    specificity: 'specific',
  });
};

scaffold(
  'subpath-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
