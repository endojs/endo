/* global process */

import test from 'ava';

test('ses-ava --only-config-* flag sees this test and the corresponding config', t => {
  t.is(process.env.SES_AVA, '1');
});
