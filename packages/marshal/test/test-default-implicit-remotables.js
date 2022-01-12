// @ts-check

import { test } from './prepare-test-env-ava.js';
// Import early, before remotable.js might initialize.
import './default_implicit_remotables.js';

import { passStyleOf } from '../src/passStyleOf.js';
import { ALLOW_IMPLICIT_REMOTABLES } from '../src/helpers/remotable.js';

// Whatever ALLOW_IMPLICIT_REMOTABLES defaults to, ensure that still works.

test('environment options', t => {
  if (ALLOW_IMPLICIT_REMOTABLES) {
    t.notThrows(() => passStyleOf(harden({ toString: () => 'foo' })));
  } else {
    t.throws(() => passStyleOf(harden({ toString: () => 'foo' })), {
      message: /Remotables must be explicitly declared/,
    });
  }
});
