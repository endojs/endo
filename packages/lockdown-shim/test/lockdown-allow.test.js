import test from 'tape';
import { lockdown } from '../src/main.js';

test('lockdown returns boolean or throws in downgraded SES', t => {
  t.plan(7);

  t.ok(
    lockdown({
      noTameDate: true,
      noTameError: true,
      noTameMath: true,
      noTameRegExp: true,
    }),
    'return true when called from JS with options',
  );

  t.notOk(
    lockdown({
      noTameDate: true,
      noTameError: true,
      noTameMath: true,
      noTameRegExp: true,
    }),
    'return false when called from SES with the same options',
  );

  t.throws(
    () => lockdown(),
    'throws when when called from SES with different options',
  );

  t.throws(
    () =>
      lockdown({
        noTameError: true,
        noTameMath: true,
        noTameRegExp: true,
      }),
    'throws when attempting to tame Date',
  );

  t.throws(
    () =>
      lockdown({
        noTameDate: true,
        noTameMath: true,
        noTameRegExp: true,
      }),
    'throws when attempting to tame Error',
  );

  t.throws(
    () =>
      lockdown({
        noTameDate: true,
        noTameError: true,
        noTameRegExp: true,
      }),
    'throws when attempting to tame Math',
  );

  t.throws(
    () =>
      lockdown({
        noTameDate: true,
        noTameError: true,
        noTameMath: true,
      }),
    'throws when attempting to tame RegExp',
  );
});
