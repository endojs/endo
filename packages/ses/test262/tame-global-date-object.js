// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from '@agoric/test262-runner';
import tameGlobalDateObject from '../src/tame-global-date-object.js';

const { defineProperties } = Object;

test262Runner({
  testDirs: ['/test/built-ins/Date'],
  excludePaths: [],
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
    defineProperties(globalThis, tameGlobalDateObject('unsafe').start);
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
