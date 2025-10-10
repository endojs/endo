import test from 'ava';

test('ses-ava --no-config-* prevents this test from being discovered', t => {
  t.fail('should not be reachable because --no-config-two');
});
