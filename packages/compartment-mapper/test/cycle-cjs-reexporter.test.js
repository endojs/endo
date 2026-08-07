/**
 * Cyclic CommonJS reexporter scenario exercised through the
 * compartment-mapper test scaffold. The companion Node.js parity test in
 * cycle-cjs-reexporter-node-parity.test.js imports the same fixture under
 * Node.js and asserts the same expected values; together the two tests
 * teach the compartment mapper's CommonJS cycle behavior and pin it to
 * Node.js's reference behavior.
 *
 * This is the pure-CommonJS counterpart to the ESM-in-CJS-cycle divergence
 * exercised by cycle-esm-in-cjs.test.js and
 * cycle-esm-in-cjs-node-parity.test.js, where Node.js rejects the topology
 * with ERR_REQUIRE_CYCLE_MODULE but SES allows it.
 */

/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';
import { assertCycleCjsReexporter } from './_cycle-cjs-reexporter-assertions.js';

const fixture = new URL(
  'fixtures-cycle-cjs-reexporter/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 3;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  assertCycleCjsReexporter(t, namespace);
};

scaffold(
  'cycle-cjs-reexporter (issue #59 follow-up)',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
