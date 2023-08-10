// Sets up a SES environment with 'assert' global
import { test } from './prepare-test-env-ava.js';

/* global globalThis */

import { Fail, q, X } from '../index.js';

test('Fail', t => {
  t.notThrows(() => true || Fail`Should not be thrown`);
  t.throws(() => false || Fail`Should be thrown`, {
    message: 'Should be thrown',
  });
});

test('short names', t => {
  t.is(q, globalThis.assert.quote);
  t.is(X, globalThis.assert.details);
});
