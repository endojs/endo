import path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import test262Runner from '@agoric/test262-runner';
import tameGlobalIntlObject from '../src/main';

test262Runner({
  testRootPath: path.join(__dirname, './test'),
  excludePaths: [
    'test/intl402/Intl/builtin.js',
    'test/intl402/Intl/getCanonicalLocales/canonicalized-tags.js',
    'test/intl402/Intl/getCanonicalLocales/canonicalized-unicode-ext-seq.js',
    'test/intl402/Intl/getCanonicalLocales/descriptor.js',
    'test/intl402/Intl/getCanonicalLocales/duplicates.js',
    'test/intl402/Intl/getCanonicalLocales/elements-not-reordered.js',
    'test/intl402/Intl/getCanonicalLocales/error-cases.js',
    'test/intl402/Intl/getCanonicalLocales/get-locale.js',
    'test/intl402/Intl/getCanonicalLocales/getCanonicalLocales.js',
    'test/intl402/Intl/getCanonicalLocales/grandfathered.js',
    'test/intl402/Intl/getCanonicalLocales/has-property.js',
    'test/intl402/Intl/getCanonicalLocales/invalid-tags.js',
    'test/intl402/Intl/getCanonicalLocales/length.js',
    'test/intl402/Intl/getCanonicalLocales/Locale-object.js',
    'test/intl402/Intl/getCanonicalLocales/locales-is-not-a-string.js',
    'test/intl402/Intl/getCanonicalLocales/locales-is-not-a-string.js',
    'test/intl402/Intl/getCanonicalLocales/main.js',
    'test/intl402/Intl/getCanonicalLocales/name.js',
    'test/intl402/Intl/getCanonicalLocales/non-iana-canon.js',
    'test/intl402/Intl/getCanonicalLocales/overriden-arg-length.js',
    'test/intl402/Intl/getCanonicalLocales/overriden-arg-length.js',
    'test/intl402/Intl/getCanonicalLocales/overriden-push.js',
    'test/intl402/Intl/getCanonicalLocales/preferred-grandfathered.js',
    'test/intl402/Intl/getCanonicalLocales/preferred-variant.js',
    'test/intl402/Intl/getCanonicalLocales/returned-object-is-an-array.js',
    'test/intl402/Intl/getCanonicalLocales/returned-object-is-mutable.js',
    'test/intl402/Intl/getCanonicalLocales/to-string.js',
    'test/intl402/Intl/getCanonicalLocales/weird-cases.js',
    'test/intl402/Intl/proto.js',
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
  captureGlobalObjectNames: ['Intl', 'Array'],
  async test(testInfo, harness, { applyCorrections }) {
    const contents = applyCorrections(testInfo.contents);
    tameGlobalIntlObject();
    // eslint-disable-next-line no-eval
    (0, eval)(`${harness}\n${contents}`);
  },
});
