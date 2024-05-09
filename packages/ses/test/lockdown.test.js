import test from 'ava';
import '../index.js';

test('lockdown returns or throws', t => {
  t.plan(3);

  t.is(undefined, lockdown(), undefined, 'return undefined');

  t.throws(lockdown, undefined, 'throw if called again, at all');

  t.throws(lockdown, undefined, 'throw if called again, at all');
});
