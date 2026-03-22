/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-export-patterns/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

/**
 * @param {ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  t.like(namespace, {
    value: 'foobar',
    helper: 'utility',
  });
};

scaffold(
  'export-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
