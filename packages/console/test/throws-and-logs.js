import { cycleTolerantStringify } from '@agoric/assert';
import { makeLoggingConsoleKit, makeCausalConsole } from '../src/console.js';

const { freeze, getPrototypeOf } = Object;

// For our internal debugging purposes
const originalConsole = console;
const dumpActualFlag = true;

const compareLogs = freeze((t, log, goldenLog) => {
  if (dumpActualFlag) {
    originalConsole.log('DUMP ACTUAL:', cycleTolerantStringify(log));
  }
  t.is(log.length, goldenLog.length, 'wrong log length');
  log.forEach((logRecord, i) => {
    const goldenRecord = goldenLog[i];
    t.is(
      logRecord.length,
      goldenRecord.length,
      `wrong length of log record {$i}`,
    );
    logRecord.forEach((logEntry, j) => {
      const goldenEntry = goldenRecord[j];
      if (
        goldenEntry === Error ||
        (typeof goldenEntry === 'function' &&
          getPrototypeOf(goldenEntry) === Error)
      ) {
        t.assert(logEntry instanceof goldenEntry, 'not the right error');
      } else {
        // tap uses `===` instead of `Object.is`.
        // Assuming ava does the right thing, switch back to this when
        // switching back to ava.
        // t.is(logEntry, goldenEntry);
        t.assert(
          Object.is(logEntry, goldenEntry),
          `${logEntry} not same as ${goldenEntry}`,
        );
      }
    });
  });
});

// To see what it would look like on a causal wrapping of the
// original console, instead of checking the output against
// the golden logs, set "checkLogs" to false.
// For this purpose, we reuse one nonLoggingConsole across all
// test cases, because the global numbering helps readability. This
// reflects how it would look in a real repair.
// When checkLogs is true, then we make a causalConsole per call
// to assertLogs so that the golden logs are decoupled.
const nonLoggingConsole = makeCausalConsole(console);

// Intended to be used with tape or something like it.
//
// Wraps thunk() but also checks the console.
// TODO It currently checks the console by temporarily assigning
// a fake logging console to the global `console` variable. Once we
// have full Compartment support, we should run tests in a compartment
// with a `console` of our choosing.
//
// During thunk(), each time a console method is called, it
// will just log an array of the method name and the
// args. For example, if the code being tested does
// ```js
// console.error('what ', err);
// ```
// the test code might check for exactly that with
// ```js
// assertLogs(t, () => /*as above*/,
//            [['error', 'what ', err]]);
// ```
export const assertLogs = freeze((t, thunk, goldenLog, options = {}) => {
  const { checkLogs = true, wrapWithCausal = false } = options;
  const { loggingConsole, takeLog } = makeLoggingConsoleKit();
  let useConsole = console;
  if (checkLogs) {
    useConsole = loggingConsole;
    if (wrapWithCausal) {
      useConsole = makeCausalConsole(useConsole);
    }
  } else if (wrapWithCausal) {
    useConsole = nonLoggingConsole;
  }

  const priorConsole = console;
  // eslint-disable-next-line no-global-assign
  console = useConsole;
  try {
    // If thunk() throws, we restore the console and the logging array.
    // An outer catcher could then check the error.
    thunk();
  } catch (err) {
    useConsole.log('Caught', err);
    throw err;
  } finally {
    // eslint-disable-next-line no-global-assign
    console = priorConsole;
    if (checkLogs) {
      const log = takeLog();
      compareLogs(t, log, goldenLog);
    }
  }
});

// Intended to be used with tape or something like it.
//
// Wraps t.throws(thunk, msg) but also checks the console.
// TODO It currently checks the console by temporarily assigning
// a fake logging console to the global `console` variable. Once we
// have full Compartment support, we should run tests in a compartment
// with a `console` of our choosing.
//
// During thunk(), each time a console method is called, it
// will just log an array of the method name and the
// args. For example, if the code being tested does
// ```js
// console.error('what ', err);
// throw new Error('foo');
// ```
// the test code might check for exactly that with
// ```js
// throwsAndLogs(t, () => /*as above*/, /foo/,
//               [['error', 'what ', err]]);
// ```
export const throwsAndLogs = freeze(
  (t, thunk, regexp, goldenLog, options = {}) => {
    // assertLogs(t, () => t.throws(thunk, { message: regexp }), goldenLog);
    t.throws(() => assertLogs(t, thunk, goldenLog, options), {
      message: regexp,
    });
  },
);
