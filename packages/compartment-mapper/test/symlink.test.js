import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-symlink/app/index.js',
  import.meta.url,
).toString();

const fixtureAssertionCount = 1;

const assertFixture = (t, { namespace }) => {
  t.is(namespace.meaning, 42);
};

scaffold('symlink', test, fixture, assertFixture, fixtureAssertionCount);
