/* global globalThis */

import test262Runner from '@endo/test262-runner';
import tameMathObject from '../src/tame-math-object.js';

test262Runner({
  testDirs: ['/test/built-ins/Math'],
  excludePaths: ['test/built-ins/Math/random/S15.8.2.14_A1.js'],
  excludeDescriptions: [],
  excludeFeatures: [
    'cross-realm', // TODO: Evaluator does not create realms.
  ],
  excludeFlags: [
    'noStrict', // TODO: Evaluator does not support sloppy mode.
  ],
  excludeErrors: [],
  sourceTextCorrections: [],
  captureGlobalObjectNames: ['Math'],
  async test(testInfo, harness) {
    globalThis.Math = tameMathObject()['%InitialMath%'];
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
