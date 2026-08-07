/**
 * Companion to cycle-rename.test.js covering the unused-live-binding shape
 * of the cyclic star-export regression (endojs/endo#59). The renamer's
 * `export var y` has no initializer; every projection of the cycle reads
 * `undefined`. Exercised through the compartment-mapper test scaffold; the
 * Node.js parity sibling in cycle-rename-unused-node-parity.test.js asserts
 * the same expected values against plain Node.js. Together the two tests
 * pin the compartment mapper's behavior for this shape to Node.js's
 * reference behavior.
 */

/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';
import { assertCycleRenameUnused } from './_cycle-rename-unused-assertions.js';

const fixture = new URL(
  'fixtures-cycle-rename-unused/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 3;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  assertCycleRenameUnused(t, namespace);
};

scaffold(
  'cycle-rename-unused (issue #59: unused live binding)',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
