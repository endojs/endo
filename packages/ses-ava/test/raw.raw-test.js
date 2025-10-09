/* global globalThis */
import test from '@endo/ses-ava/test.js';

test('SES is not initialized with -C ses-ava-is-ava', t => {
  t.is(undefined, globalThis.lockdown);
});
