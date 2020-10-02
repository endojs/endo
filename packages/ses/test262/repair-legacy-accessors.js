import test262Runner from '@agoric/test262-runner';
import repairLegacyAccessors from '../src/repair-legacy-accessors.js';

test262Runner({
  testDirs: [
    'test/annexB/built-ins/Object/prototype/__defineGetter__',
    'test/annexB/built-ins/Object/prototype/__defineSetter__',
    'test/annexB/built-ins/Object/prototype/__lookupGetter__',
    'test/annexB/built-ins/Object/prototype/__lookupSetter__',
  ],
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
  captureGlobalObjectNames: ['Object'],
  async test(testInfo, harness) {
    repairLegacyAccessors();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${testInfo.contents}`);
  },
});
