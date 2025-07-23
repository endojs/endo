// @ts-nocheck

import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';

const fixture = new URL(
  'fixtures-implicit-reexport/index.js',
  import.meta.url,
).toString();

const assertFixture = () => {};

scaffold('fixtures-implicit-reexport', test, fixture, assertFixture, 0);
