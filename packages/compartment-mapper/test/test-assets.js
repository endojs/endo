import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL('fixtures-assets/main.js', import.meta.url).toString();

const fixtureAssertionCount = 1;

const assertFixture = t => {
  t.pass();
};

scaffold('fixture-assets', test, fixture, assertFixture, fixtureAssertionCount);
