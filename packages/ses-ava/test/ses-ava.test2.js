import test from 'ava';

test('ses-ava --ses-ava-no-* prevents this test from being discovered', t => {
  t.fail('should not be reachable because --ses-ava-no-two');
});
