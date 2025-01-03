import test from 'ava';
import '../index.js';

test('lockdown returns or throws', t => {
  t.plan(3);

  // @ts-expect-error TS treats 'void' separate from undefined
  t.is(undefined, lockdown(), 'return undefined');

  t.throws(lockdown, undefined, 'throw if called again, at all');

  t.throws(lockdown, undefined, 'throw if called again, at all');
});
