/** @import {ExecutionContext} from 'ava' */

import 'ses';
import test from 'ava';
import { scaffold, readPowers } from './scaffold.js';
import { importLocation } from '../index.js';

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

// Regression test for: packages whose exports include a passthrough wildcard
// like "./*": "./*" cause a promise deadlock in the memoized module loader.
// The wildcard produces a within-compartment pattern whose resolved path is
// identical to the input specifier.  When the moduleMapHook returns that
// self-referential redirect, SES's memoized loader ends up awaiting the
// in-flight Promise for the specifier from within that same Promise's
// resolution chain — a deadlock that silently empties the event loop.
// The pattern is present in tslib >=2.x, which is a transitive dependency
// of many popular packages.
test('loading dual-format package with ./* wildcard export does not stall (tslib pattern)', async t => {
  t.timeout(5000);
  const tslibMockConsumer = new URL(
    'fixtures-export-patterns/node_modules/tslib-mock-consumer/main.js',
    import.meta.url,
  ).toString();

  const { namespace } = await importLocation(readPowers, tslibMockConsumer);

  t.is(namespace.theAnswer, 42);
  t.is(namespace.double(21), 42);
});
