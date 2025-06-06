import test from 'ava';
import './_prepare-with-extra-intrinsics.js';
import { assertLogs } from './_throws-and-logs.js';

const logRecordMatches = (logRecord, goldenRecord) =>
  Array.isArray(logRecord) &&
  Array.isArray(goldenRecord) &&
  logRecord.length === goldenRecord.length &&
  logRecord.every((logEntry, i) => logEntry === goldenRecord[i]);

/**
 * Test that log includes goldenLog in order
 * that is: test that they match but for possible extra warning lines in log.
 * Specialized for the test below.
 * See https://github.com/endojs/endo/issues/1973
 *
 * @param {import('ava').ExecutionContext} t
 * @param {any[][]} log
 * @param {any[][]} goldenLog
 */
const compareLogs = (t, log, goldenLog) => {
  t.deepEqual(log[0], goldenLog[0]);
  const logLast = log.length - 1;
  const goldenLast = goldenLog.length - 1;
  t.deepEqual(log[logLast], goldenLog[goldenLast]);
  t.assert(logLast >= goldenLast);

  let g = 1;
  let skip = 0;
  for (; g < goldenLast; g += 1) {
    const logRecord = log[g + skip];
    const goldenRecord = goldenLog[g];
    if (logRecordMatches(logRecord, goldenRecord)) {
      // eslint-disable-next-line no-continue
      continue;
    }
    if (g + skip >= logLast) {
      // no more slack left
      t.deepEqual(logRecord, goldenRecord, 'log record mismatch');
      t.fail('log record mismatch');
    }
    if (logRecord[0] !== 'warn') {
      t.fail('can only skip warnings');
    }
    skip += 1;
  }
};

test('permit removal warnings', t => {
  assertLogs(
    t,
    () => lockdown({ reporting: 'console' }),
    [
      ['groupCollapsed', 'SES Removing unpermitted intrinsics'],
      ['warn', 'Removing intrinsics.Array.isArray.prototype'],
      [
        'warn',
        'Tolerating undeletable intrinsics.Array.isArray.prototype === undefined',
      ],
      ['warn', 'Removing intrinsics.Array.extraRemovableDataProperty'],
      ['groupEnd'],
    ],
    { compareLogs },
  );
});
