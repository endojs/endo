import test from 'ava';

test('ses-ava --no-* prevents this test from being discovered', t => {
  t.fail('should not be reachable because --no-two');
});
