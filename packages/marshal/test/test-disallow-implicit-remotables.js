// @ts-check

import { test } from './prepare-test-env-ava.js';
// Import early, before remotable.js might initialize.
import './disallow_implicit_remotables.js';

import { passStyleOf } from '../src/passStyleOf.js';

test('environment options', t => {
  t.throws(() => passStyleOf(harden({ toString: () => 'foo' })), {
    message: /Remotables must be explicitly declared/,
  });
});
