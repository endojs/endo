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
