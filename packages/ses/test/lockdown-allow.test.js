/* global lockdown */
import test from 'tape';
import '../src/main.js';

test('lockdown returns boolean or throws in downgraded SES', t => {
  t.plan(6);

  t.ok(
    lockdown({
      dateTaming: 'unsafe',
      errorTaming: 'unsafe',
      mathTaming: 'unsafe',
      regExpTaming: 'unsafe',
    }),
    'return true when called from JS with options',
  );

  t.notOk(
    lockdown({
      dateTaming: 'unsafe',
      errorTaming: 'unsafe',
      mathTaming: 'unsafe',
      regExpTaming: 'unsafe',
    }),
    'return false when called from SES with the same options',
  );

  t.throws(
    () =>
      lockdown({
        dateTaming: 'safe',
      }),
    'throws when attempting to tame Date',
  );

  t.throws(
    () =>
      lockdown({
        errorTaming: 'safe',
      }),
    'throws when attempting to tame Error',
  );

  t.throws(
    () =>
      lockdown({
        mathTaming: 'safe',
      }),
    'throws when attempting to tame Math',
  );

  t.throws(
    () =>
      lockdown({
        regExpTaming: 'safe',
      }),
    'throws when attempting to tame RegExp',
  );
});
