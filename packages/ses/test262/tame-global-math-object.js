// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from '@agoric/test262-runner';
import tameGlobalMathObject from '../src/tame-global-math-object.js';

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
    tameGlobalMathObject();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
