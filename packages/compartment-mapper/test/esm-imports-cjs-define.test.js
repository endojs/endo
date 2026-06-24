/* eslint-disable no-underscore-dangle */
// import "./ses-lockdown.js";
import 'ses';
import test from 'ava';

import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-esm-imports-cjs-define/0.mjs',
  import.meta.url,
).toString();

const assertFixture = t => t.pass();

const fixtureAssertionCount = 1;

scaffold(
  'fixtures-esm-imports-cjs-define',
  test,
  fixture,
  assertFixture,
  fixtureAssertionCount,
);
const fixtureHack = new URL(
  'fixtures-esm-imports-cjs-define/hack1.mjs',
  import.meta.url,
).toString();

const assertFixtureHack = (t, data) => {
  t.is(data.namespace.shared, 'I am shared-pkg version 2.0.0');
};

scaffold(
  'fixtures-esm-imports-cjs-define/hack1',
  test,
  fixtureHack,
  assertFixtureHack,
  fixtureAssertionCount,
  {
    addGlobals: {
      console,
    },
  },
);
