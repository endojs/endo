import 'ses';
import test from 'ava';
import { scaffold } from './scaffold.js';
import jsonp from './_parse-jsonp.js';

// The JSONP parser uses harden, as a bit.
lockdown({
  errorTaming: 'unsafe',
  errorTrapping: 'none',
});

scaffold(
  'languageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/module-app/module.xsonp',
    import.meta.url,
  ).href,
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      default: {
        meaning: 42,
      },
      __proto__: {
        __proto__: null,
        [Symbol.toStringTag]: 'Module',
      },
    });
  },
  1,
  {
    parserForLanguage: { jsonp },
    languageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'moduleLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/module-app/module.xsonp',
    import.meta.url,
  ).href,
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      default: {
        meaning: 42,
      },
      __proto__: {
        __proto__: null,
        [Symbol.toStringTag]: 'Module',
      },
    });
  },
  1,
  {
    parserForLanguage: { jsonp },
    moduleLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'commonjsLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      default: {
        meaning: 42,
      },
      __proto__: {
        __proto__: null,
        [Symbol.toStringTag]: 'Module',
      },
    });
  },
  1,
  {
    parserForLanguage: { jsonp },
    commonjsLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'package.json parsers override languageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/parsers-app/module.xsonp',
    import.meta.url,
  ).href,
  (t, { namespace }) => {
    t.deepEqual(namespace, {
      default: {
        meaning: 42,
      },
      __proto__: {
        __proto__: null,
        [Symbol.toStringTag]: 'Module',
      },
    });
  },
  1,
  {
    parserForLanguage: { jsonp },
    languageForExtension: { xsonp: 'text' },
  },
);
