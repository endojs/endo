/* global globalThis */

import test262Runner from '@endo/test262-runner';
import tameErrorConstructor from '../src/error/tame-error-constructor.js';

test262Runner({
  testDirs: ['/test/built-ins/Error'],
  excludePaths: [
    // Excluded because Error.prototype.constructor is SharedError
    'test/built-ins/Error/S15.11.1_A1_T1.js',
    'test/built-ins/Error/prototype/constructor/S15.11.4.1_A1_T1.js',
    'test/built-ins/Error/prototype/constructor/S15.11.4.1_A1_T2.js',
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
  captureGlobalObjectNames: ['Error'],
  async test(testInfo, harness) {
    globalThis.Error = tameErrorConstructor()['%InitialError%'];
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
