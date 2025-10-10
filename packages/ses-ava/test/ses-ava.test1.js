/* global process */

import test from 'ava';

test('ses-ava --ses-ava-only-* flag sees this test and the corresponding config', t => {
  t.is(process.env.SES_AVA, '1');
});
