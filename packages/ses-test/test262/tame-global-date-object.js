/* global globalThis */

import test262Runner from '@endo/test262-runner';
import tameDateConstructor from '../src/tame-date-constructor.js';

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
    globalThis.Date = tameDateConstructor()['%InitialDate%'];
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
