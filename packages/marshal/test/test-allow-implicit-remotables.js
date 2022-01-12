// @ts-check

import { test } from './prepare-test-env-ava.js';
// Import early, before remotable.js might initialize.
import './allow_implicit_remotables.js';

import { passStyleOf } from '../src/passStyleOf.js';

test('environment options', t => {
  t.notThrows(() => passStyleOf(harden({ toString: () => 'foo' })));
});
