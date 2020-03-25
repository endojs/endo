// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from '@agoric/test262-runner';
import tameGlobalRegExpObject from '../src/tame-global-reg-exp-object.js';

test262Runner({
  testDirs: ['/test/built-ins/RegExp'],
  excludePaths: [
    'test/built-ins/RegExp/property-escapes/', // TODO refine
    'test/built-ins/RegExp/match-indices/', // TODO refine

    'test/built-ins/RegExp/call_with_non_regexp_same_constructor.js',
    'test/built-ins/RegExp/from-regexp-like-short-circuit.js',
    'test/built-ins/RegExp/prototype/Symbol.replace/coerce-global.js',
    'test/built-ins/RegExp/prototype/Symbol.replace/fn-invoke-this-strict.js',
    'test/built-ins/RegExp/prototype/test/S15.10.6.3_A9.js',
    'test/built-ins/RegExp/S15.10.3.1_A1_T1.js',
    'test/built-ins/RegExp/S15.10.3.1_A1_T2.js',
    'test/built-ins/RegExp/S15.10.3.1_A1_T3.js',
    'test/built-ins/RegExp/S15.10.3.1_A1_T4.js',
    'test/built-ins/RegExp/S15.10.3.1_A1_T5.js',
    'test/built-ins/RegExp/S15.10.3.1_A2_T2.js',
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
  captureGlobalObjectNames: ['RegExp'],
  async test(testInfo, harness) {
    tameGlobalRegExpObject();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
