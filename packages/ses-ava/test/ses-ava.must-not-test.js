import test from 'ava';

test('ses-ava --exclude prevents this test from being discovered', t => {
  t.fail('should not be reachable because --exclude two');
});
