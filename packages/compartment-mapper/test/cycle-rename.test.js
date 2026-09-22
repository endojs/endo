/**
 * Regression for endojs/endo#59 (cyclic star export with renaming reexport)
 * exercised through the compartment-mapper test scaffold. The companion
 * Node.js parity test in cycle-rename-node-parity.test.js imports the same
 * fixture under Node.js and asserts the same expected values; together the
 * two tests tease the linker behavior out of SES and pin it to Node.js's
 * reference behavior.
 */

/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';
import { assertCycleRename } from './_cycle-rename-assertions.js';

const fixture = new URL(
  'fixtures-cycle-rename/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 3;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  assertCycleRename(t, namespace);
};

scaffold(
  'cycle-rename (issue #59)',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
