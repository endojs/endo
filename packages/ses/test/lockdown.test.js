import test from 'tape';
import { lockdown } from '../src/lockdown-shim.js';

test('lockdown returns boolean or throws in SES', t => {
  t.plan(6);

  t.ok(lockdown(), 'return true when called from JS without options');
  t.notOk(
    lockdown(),
    'return false when called from SES with the same options',
  );
  t.throws(
    () => lockdown({ noTameDate: true }),
    'throws when attempting to untame Date',
  );
  t.throws(
    () => lockdown({ noTameError: true }),
    'throws when attempting to untame Error',
  );
  t.throws(
    () => lockdown({ noTameMath: true }),
    'throws when attempting to untame Math',
  );
  t.throws(
    () => lockdown({ noTameRegExp: true }),
    'throws when attempting to untame RegExp',
  );
});
