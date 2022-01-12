// @ts-check

import { test } from './prepare-test-env-ava.js';
import { passStyleOf } from '../src/passStyleOf.js';
import { ALLOW_IMPLICIT_REMOTABLES } from '../src/helpers/remotable.js';

// Whatever ALLOW_IMPLICIT_REMOTABLES is set to in the current test
// environment, ensure that still works.

test('environment options', t => {
  if (ALLOW_IMPLICIT_REMOTABLES) {
    t.notThrows(() => passStyleOf(harden({ toString: () => 'foo' })));
  } else {
    t.throws(() => passStyleOf(harden({ toString: () => 'foo' })), {
      message: /Remotables must be explicitly declared/,
    });
  }
});
