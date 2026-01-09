import 'ses';
import test from 'ava';
import { scaffold, moduleify } from './scaffold.js';

const fixture = new URL(
  'fixtures-export-patterns/node_modules/app/main.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 2;

/**
 * @param {import('ava').ExecutionContext} t
 * @param {{namespace: object}} result
 */
const assertFixture = (t, { namespace }) => {
  t.is(namespace.value, 'foobar');
  t.is(namespace.helper, 'utility');
};

scaffold(
  'export-patterns',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
