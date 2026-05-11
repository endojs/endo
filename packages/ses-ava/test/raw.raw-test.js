/* global globalThis */
// eslint-disable-next-line import/no-extraneous-dependencies
import test from '@endo/ses-ava/test.js';

test('SES is not initialized with -C ses-ava-is-ava', t => {
  t.is(undefined, globalThis.lockdown);
});
