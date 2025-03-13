import 'ses';
import test from 'ava';
import { scaffold, sanitizePaths } from './scaffold.js';
import jsonp from './_parse-jsonp.js';

// The JSONP parser uses harden, as a bit.
lockdown({
  errorTaming: 'unsafe',
  errorTrapping: 'none',
});

const meaningfulModule = {
  default: {
    meaning: 42,
  },
  __proto__: {
    __proto__: null,
    [Symbol.toStringTag]: 'Module',
  },
};

const assertions = (t, { namespace }) => {
  t.deepEqual(namespace, meaningfulModule);
};

const assertionCount = 1;

scaffold(
  'languageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
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
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    moduleLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'moduleLanguageForExtension should not be available in commonjs package',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    moduleLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'commonjsLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    commonjsLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'commonjsLanguageForExtension should not be available in module package',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    commonjsLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'package.json parsers override languageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/parsers-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    languageForExtension: { xsonp: 'text' },
  },
);

scaffold(
  'workspaceLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/packages/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    workspaceLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'workspaceModuleLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/packages/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    workspaceModuleLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'workspaceModuleLanguageForExtension should not be available in commonjs package',
  test,
  new URL(
    'fixtures-language-for-extension/packages/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    workspaceModuleLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'workspaceModuleLanguageForExtension should not be available under node_modules',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    workspaceModuleLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'workspaceCommonjsLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/packages/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    workspaceCommonjsLanguageForExtension: { xsonp: 'jsonp' },
  },
);

scaffold(
  'workspaceCommonjsLanguageForExtension should not be available in module package',
  test,
  new URL(
    'fixtures-language-for-extension/packages/module-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    workspaceCommonjsLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'workspaceCommonjsLanguageForExtension should not be available under node_modules',
  test,
  new URL(
    'fixtures-language-for-extension/node_modules/commonjs-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  1, // expected number of assertions
  {
    parserForLanguage: { jsonp },
    workspaceCommonjsLanguageForExtension: { xsonp: 'jsonp' },
    shouldFailBeforeArchiveOperations: true,
    onError(t, { error }) {
      t.snapshot(sanitizePaths(error.message));
    },
  },
);

scaffold(
  'package.json parsers override workspaceLanguageForExtension',
  test,
  new URL(
    'fixtures-language-for-extension/packages/parsers-app/module.xsonp',
    import.meta.url,
  ).href,
  assertions,
  assertionCount,
  {
    parserForLanguage: { jsonp },
    workspaceLanguageForExtension: { xsonp: 'text' },
  },
);
