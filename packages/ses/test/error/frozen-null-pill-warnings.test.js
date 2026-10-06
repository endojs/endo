import test from 'ava';
import './_prepare-with-frozen-null-pills.js';
import { assertLogs } from './_throws-and-logs.js';

/**
 * Test that every golden record appears in the log, in order, allowing
 * unrelated records in between, since engines may add other properties
 * that lockdown removes with a warning.
 * See https://github.com/endojs/endo/issues/1973
 *
 * @param {import('ava').ExecutionContext} t
 * @param {any[][]} log
 * @param {any[][]} goldenLog
 */
const compareLogs = (t, log, goldenLog) => {
  let i = 0;
  for (const goldenRecord of goldenLog) {
    const golden = JSON.stringify(goldenRecord);
    while (i < log.length && JSON.stringify(log[i]) !== golden) {
      i += 1;
    }
    t.true(i < log.length, `missing log record ${golden}`);
    i += 1;
  }
};

test('frozen null arguments/caller pills are tolerated with a warning', t => {
  assertLogs(
    t,
    () => lockdown({ reporting: 'console' }),
    [
      ['groupCollapsed', 'SES Removing unpermitted intrinsics'],
      ['warn', 'Removing intrinsics.Array.isArray.arguments'],
      [
        'warn',
        'Tolerating undeletable intrinsics.Array.isArray.arguments === null',
      ],
      ['warn', 'Removing intrinsics.Array.isArray.caller'],
      [
        'warn',
        'Tolerating undeletable intrinsics.Array.isArray.caller === null',
      ],
      ['groupEnd'],
    ],
    { compareLogs },
  );
  // The pills survive lockdown, still inert.
  t.is(Array.isArray.arguments, null);
  t.is(Array.isArray.caller, null);
  t.true(Array.isArray([]));
});
