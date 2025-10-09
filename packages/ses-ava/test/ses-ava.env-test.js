/* global process */

import test from 'ava';

test('ses-ava env', t => {
  // ses-ava --only-config-* flag sees this test and the corresponding config
  t.is(process.env.SES_AVA, '1');
});
