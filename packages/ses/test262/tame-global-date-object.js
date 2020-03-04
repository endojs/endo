// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from '@agoric/test262-runner';
import tameGlobalDateObject from '../src/tame-global-date-object.js';

test262Runner({
  testDirs: ['/test/built-ins/Date'],
  excludePaths: [
    'test/built-ins/Date/prototype/setHours/arg-min-to-number-err.js',
    'test/built-ins/Date/prototype/setHours/arg-ms-to-number-err.js',
    'test/built-ins/Date/prototype/setHours/arg-sec-to-number-err.js',
    'test/built-ins/Date/prototype/setMinutes/arg-ms-to-number-err.js',
    'test/built-ins/Date/prototype/setMinutes/arg-sec-to-number-err.js',
    'test/built-ins/Date/prototype/setMonth/arg-date-to-number-err.js',
    'test/built-ins/Date/prototype/setSeconds/arg-ms-to-number-err.js',
    'test/built-ins/Date/prototype/setTime/new-value-time-clip.js',
    'test/built-ins/Date/prototype/toDateString/format.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-10.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-11.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-12.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-5.js',
    'test/built-ins/Date/prototype/toISOString/15.9.5.43-0-9.js',
    'test/built-ins/Date/prototype/toJSON/invoke-result.js',
    'test/built-ins/Date/prototype/toString/format.js',
    'test/built-ins/Date/prototype/toTimeString/format.js',
    'test/built-ins/Date/prototype/toUTCString/format.js',
  ],
  excludeDescriptions: [],
  excludeFeatures: [
    'cross-realm', // TODO: Evaluator does not create realms.
  ],
  excludeFlags: [
    'noStrict', // TODO: Evaluator does not support sloppy mode.
  ],
  excludeErrors: [],
  sourceTextCorrections: [],
  captureGlobalObjectNames: ['Date'],
  async test(testInfo, harness) {
    tameGlobalDateObject();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
