/**
 * Shared configuration values consumed by both the legacy eslintrc configs
 * (src/configs/*.js) and the flat config factories (src/index.js).
 *
 * This module exports only plain data constants — no ESLint plugin imports —
 * so it is safe to evaluate eagerly at module load time without triggering
 * the require(ESM) cycle guard.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * @import {Linter} from 'eslint';
 */

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Absolute path to the endo monorepo root, computed from this file's location
 * (src/configs/ → src/ → eslint-plugin/ → packages/ → endo/).
 *
 * Used as `tsconfigRootDir` so TypeScript-ESLint can locate tsconfig files
 * from any package in the monorepo.
 */
export const tsconfigRootDir = path.join(__dirname, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// TypeScript parser / project-service options
// ---------------------------------------------------------------------------

/**
 * Shared `parserOptions` fragment for TypeScript-ESLint's project service.
 *
 * Consumers spread this into their own `parserOptions` (legacy) or flat
 * `parserOptions` block, then append `tsconfigRootDir` and any additional
 * format-specific fields (e.g. `sourceType: 'module'` for legacy).
 */
export const projectServiceOptions = {
  useProjectService: true,
  projectService: {
    allowDefaultProject: ['*.js', '*.mjs', '*.cjs'],
    defaultProject: 'tsconfig.json',
  },
};

// ---------------------------------------------------------------------------
// Ignore patterns (unified — trailing * catches .map companions too)
// ---------------------------------------------------------------------------

/**
 * File patterns to ignore across all configs.
 *
 * The trailing `*` on declaration-file globs (e.g. `**\/*.d.ts*`) is valid in
 * both eslintrc `ignorePatterns` and flat `ignores`, and additionally ignores
 * `.d.ts.map` source-map files.
 */
export const ignorePatterns = [
  '**/tmp/**',
  '**/test262*/**',
  '**/output/**',
  '**/dist/**',
  '**/coverage/**',
  '**/bundles/**',
  '**/build/**',
  '**/ava*.config.{js,mjs,cjs}',
  '**/*.types.js',
  '**/*.d.{ts,cts,mts}',
  '!**/*.types.{ts,cts,mts}',
];

// ---------------------------------------------------------------------------
// Hardened-JS / SES globals
// ---------------------------------------------------------------------------

/**
 * Globals exported by a Hardened JS (SES) environment.
 *
 * Used by both the `recommended` legacy config and the `flat/recommended`
 * config's `languageOptions.globals`.
 *
 * @satisfies {Linter.LanguageOptions['globals']}
 */
export const hardenedGlobals = {
  assert: 'readonly',
  console: 'readonly',
  Compartment: 'readonly',
  ModuleSource: 'readonly',
  TextDecoder: 'readonly',
  TextEncoder: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',

  // Float arrays open a NaN side-channel on some platforms; not powerless.
  Float16Array: 'readonly',
  Float32Array: 'readonly',
  Float64Array: 'readonly',

  // SES-hardened globals from its whitelist.
  Array: 'readonly',
  ArrayBuffer: 'readonly',
  BigInt: 'readonly',
  BigInt64Array: 'readonly',
  BigUint64Array: 'readonly',
  Boolean: 'readonly',
  DataView: 'readonly',
  EvalError: 'readonly',
  Int8Array: 'readonly',
  Int16Array: 'readonly',
  Int32Array: 'readonly',
  Map: 'readonly',
  Number: 'readonly',
  Object: 'readonly',
  Promise: 'readonly',
  Proxy: 'readonly',
  RangeError: 'readonly',
  ReferenceError: 'readonly',
  Set: 'readonly',
  String: 'readonly',
  Symbol: 'readonly',
  SyntaxError: 'readonly',
  TypeError: 'readonly',
  Uint8Array: 'readonly',
  Uint8ClampedArray: 'readonly',
  Uint16Array: 'readonly',
  Uint32Array: 'readonly',
  URIError: 'readonly',
  WeakMap: 'readonly',
  WeakSet: 'readonly',
  JSON: 'readonly',
  Reflect: 'readonly',
  escape: 'readonly',
  unescape: 'readonly',
  lockdown: 'readonly',
  harden: 'readonly',
  HandledPromise: 'readonly',
  AggregateError: 'readonly',
};

// ---------------------------------------------------------------------------
// recommended rules
// ---------------------------------------------------------------------------

/**
 * Core rule enablements for Hardened JS code, inlined from the airbnb-base
 * style guide's logic rules (delta over eslint:recommended) plus endo's own
 * custom rules. Formatting rules live in {@link styleRules}.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const recommendedRules = {
  // endo-specific rules
  '@endo/assert-fail-as-throw': 'error',
  '@endo/no-assign-to-exported-let-var-or-function': 'error',
  '@endo/no-harden-pattern-maker': 'warn',
  '@endo/no-multi-name-local-export': 'error',

  // best-practices (airbnb-base delta over eslint:recommended)
  'array-callback-return': ['error', { allowImplicit: true }],
  'block-scoped-var': 'error',
  'class-methods-use-this': ['error', { exceptMethods: [] }],
  curly: ['error', 'multi-line'],
  'default-case': ['error', { commentPattern: '^no default$' }],
  'default-case-last': 'error',
  'default-param-last': 'error',
  'dot-notation': ['error', { allowKeywords: true }],
  eqeqeq: ['error', 'always', { null: 'ignore' }],
  'grouped-accessor-pairs': 'error',
  'guard-for-in': 'error',
  'max-classes-per-file': ['error', 1],
  'no-alert': 'warn',
  'no-caller': 'error',
  'no-constructor-return': 'error',
  'no-empty-function': [
    'error',
    { allow: ['arrowFunctions', 'functions', 'methods'] },
  ],
  'no-eval': 'error',
  'no-extend-native': 'error',
  'no-extra-bind': 'error',
  'no-extra-label': 'error',
  'no-implied-eval': 'error',
  'no-iterator': 'error',
  'no-labels': ['error', { allowLoop: false, allowSwitch: false }],
  'no-lone-blocks': 'error',
  'no-multi-str': 'error',
  'no-new': 'error',
  'no-new-func': 'error',
  'no-new-wrappers': 'error',
  'no-octal-escape': 'error',
  'no-proto': 'error',
  'no-restricted-properties': [
    'error',
    {
      object: 'arguments',
      property: 'callee',
      message: 'arguments.callee is deprecated',
    },
    {
      object: 'global',
      property: 'isFinite',
      message: 'Please use Number.isFinite instead',
    },
    {
      object: 'self',
      property: 'isFinite',
      message: 'Please use Number.isFinite instead',
    },
    {
      object: 'window',
      property: 'isFinite',
      message: 'Please use Number.isFinite instead',
    },
    {
      object: 'global',
      property: 'isNaN',
      message: 'Please use Number.isNaN instead',
    },
    {
      object: 'self',
      property: 'isNaN',
      message: 'Please use Number.isNaN instead',
    },
    {
      object: 'window',
      property: 'isNaN',
      message: 'Please use Number.isNaN instead',
    },
    {
      property: '__defineGetter__',
      message: 'Please use Object.defineProperty instead.',
    },
    {
      property: '__defineSetter__',
      message: 'Please use Object.defineProperty instead.',
    },
    {
      object: 'Math',
      property: 'pow',
      message: 'Use the exponentiation operator (**) instead.',
    },
  ],
  'no-return-await': 'error',
  'no-script-url': 'error',
  'no-self-compare': 'error',
  'no-sequences': 'error',
  'no-throw-literal': 'error',
  'no-useless-concat': 'error',
  'no-useless-return': 'error',
  'no-void': 'error',
  'prefer-promise-reject-errors': ['error', { allowEmptyReject: true }],
  radix: 'error',
  'vars-on-top': 'error',
  yoda: 'error',

  // errors (airbnb-base delta over eslint:recommended)
  'getter-return': ['error', { allowImplicit: true }],
  'no-await-in-loop': 'error',
  'no-cond-assign': ['error', 'always'],
  'no-constant-condition': 'warn',
  'no-template-curly-in-string': 'error',
  'no-unreachable-loop': ['error', { ignore: [] }],
  'no-unsafe-optional-chaining': [
    'error',
    { disallowArithmeticOperators: true },
  ],
  // eslint:recommended enables this; airbnb explicitly disables it — preserve airbnb's intent
  'no-unused-private-class-members': 'off',
  'valid-typeof': ['error', { requireStringLiterals: true }],

  // node (airbnb-base: deprecated Node rules still present in ESLint 10)
  'global-require': 'error',
  'no-buffer-constructor': 'error',
  'no-new-require': 'error',
  'no-path-concat': 'error',

  // variables (airbnb-base delta over eslint:recommended)
  'no-label-var': 'error',
  'no-shadow': 'error',
  'no-undef-init': 'error',
  'no-use-before-define': [
    'error',
    { functions: true, classes: true, variables: true },
  ],

  // es6 (airbnb-base delta over eslint:recommended)
  'no-restricted-exports': [
    'error',
    { restrictedNamedExports: ['default', 'then'] },
  ],
  'no-useless-computed-key': 'error',
  'no-useless-constructor': 'error',
  'no-useless-rename': [
    'error',
    { ignoreDestructuring: false, ignoreImport: false, ignoreExport: false },
  ],
  'no-var': 'error',
  'object-shorthand': [
    'error',
    'always',
    { ignoreConstructors: false, avoidQuotes: true },
  ],
  'prefer-const': [
    'error',
    { destructuring: 'any', ignoreReadBeforeAssign: true },
  ],
  'prefer-numeric-literals': 'error',
  'prefer-rest-params': 'error',
  'prefer-spread': 'error',
  'prefer-template': 'error',
  'symbol-description': 'error',

  // style / non-formatting (airbnb-base logic rules, not layout)
  camelcase: ['error', { properties: 'never', ignoreDestructuring: false }],
  'func-names': 'warn',
  'new-cap': [
    'error',
    {
      newIsCap: true,
      newIsCapExceptions: [],
      capIsNew: false,
      capIsNewExceptions: ['Immutable.Map', 'Immutable.Set', 'Immutable.List'],
    },
  ],
  'no-array-constructor': 'error',
  'no-bitwise': 'error',
  'no-continue': 'error',
  'no-lonely-if': 'error',
  'no-multi-assign': ['error'],
  'no-nested-ternary': 'error',
  'no-new-object': 'error',
  'no-plusplus': 'error',
  'no-underscore-dangle': [
    'error',
    {
      allow: ['__dirname', '__filename'],
      allowAfterThis: false,
      allowAfterSuper: false,
      enforceInMethodNames: true,
    },
  ],
  'no-unneeded-ternary': ['error', { defaultAssignment: false }],
  'one-var': ['error', 'never'],
  'operator-assignment': ['error', 'always'],
  'prefer-exponentiation-operator': 'error',
  'prefer-object-spread': 'error',

  // this is useful for establishing the type of a variable
  'no-useless-assignment': 'off',
  // we don't always want to do this, but it's a good reminder
  'preserve-caught-error': 'warn',
  // empty try/catch blocks are fine
  'no-empty': ['error', { allowEmptyCatch: true }],
};

// ---------------------------------------------------------------------------
// style rules
// ---------------------------------------------------------------------------

/**
 * `@stylistic/eslint-plugin` formatting rules that are applied in the flat
 * `style` config AFTER `eslint-config-prettier`.
 *
 * Kept separate from {@link styleRules} so these rules never flow through the
 * legacy `eslintrc` `FlatCompat` path (where `@stylistic/eslint-plugin` is not
 * available).
 *
 * @satisfies {Linter.RulesRecord}
 */
export const stylisticRules = {
  '@stylistic/quotes': [
    'error',
    'single',
    { avoidEscape: true, allowTemplateLiterals: 'always' },
  ],
  '@stylistic/comma-dangle': ['error', 'always-multiline'],
};

/**
 * Style-related rules.
 *
 * Omits `@stylistic/*` rules (those live in {@link stylisticRules}) so this
 * object is safe to use with `FlatCompat`.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const styleRules = {
  'consistent-return': 'warn',
  'no-fallthrough': 'warn',

  'arrow-body-style': 0,
  'prefer-arrow-callback': 0,

  strict: 'off',
  'prefer-destructuring': 'off',
  'prefer-regex-literals': 'off',
  'no-else-return': 'off',
  'no-console': 'off',
  'no-return-assign': 'off',
  'no-param-reassign': 'off',
  'no-promise-executor-return': 'off',
  'no-restricted-syntax': ['off'],
  'no-unused-expressions': 'off',
  'no-loop-func': 'off',
  'no-inner-declarations': 'off',

  'jsdoc/no-multi-asterisks': ['warn', { allowWhitespace: true }],
  'jsdoc/no-undefined-types': 'off',
  'jsdoc/require-jsdoc': 'off',
  'jsdoc/require-property-description': 'off',
  'jsdoc/require-param-description': 'off',
  'jsdoc/require-returns': 'off',
  'jsdoc/require-returns-description': 'off',
  'jsdoc/require-yields': 'off',
  'jsdoc/tag-lines': 'off',
  'jsdoc/valid-types': 'off',
  'jsdoc/check-tag-names': [
    'error',
    { definedTags: ['privateRemarks', 'remarks'] },
  ],

  'no-unused-vars': [
    'error',
    {
      args: 'none',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrorsIgnorePattern: '^_',
    },
  ],
};

/**
 * Rule overrides applied to `**\/*.ts` files within the `style` config.
 * @satisfies {Linter.RulesRecord}
 */
export const styleTsOverrideRules = {
  'import/no-unresolved': 'off',
  'no-unused-vars': 'off',
  'jsdoc/require-param': 'off',
  'jsdoc/require-param-type': 'off',
};

/**
 * Plugin settings for the `style` config.
 *
 * @satisfies {Linter.Config['settings']}
 */
export const styleSettings = {
  jsdoc: { mode: 'typescript' },
};

// ---------------------------------------------------------------------------
// imports rules + settings
// ---------------------------------------------------------------------------

/**
 * Shared `eslint-plugin-import` resolver / extension / ignore values, inlined
 * from airbnb-base.
 *
 * The `ignore` list includes `node_modules`: without it, the plugin parses the
 * full source of every resolved dependency (e.g. `typescript`'s ~9 MB main
 * module) to build export maps, retaining gigabytes and eventually OOM-ing a
 * full-repo lint.
 */
const importSharedSettings = {
  resolver: {
    node: {
      extensions: ['.mjs', '.js', '.json'],
    },
  },
  extensions: ['.js', '.mjs', '.jsx'],
  ignore: ['node_modules', '\\.(coffee|scss|css|less|hbs|svg|json)$'],
};

/**
 * `eslint-plugin-import` resolver / extension settings inlined from
 * airbnb-base.  Consumed by both the flat `imports` config and the legacy
 * eslintrc `imports.js`.
 *
 * Endo resolves `eslint-plugin-import` to the `eslint-plugin-import-x` fork,
 * which reads its settings under the `import-x/` namespace rather than
 * `import/`.  We publish both namespaces so the settings apply regardless of
 * which implementation is installed — critically, so the `node_modules`
 * ignore actually takes effect and prevents catastrophic export-map parsing.
 */
export const importsSettings = {
  'import/resolver': importSharedSettings.resolver,
  'import/extensions': importSharedSettings.extensions,
  'import/ignore': importSharedSettings.ignore,
  'import-x/resolver': importSharedSettings.resolver,
  'import-x/extensions': importSharedSettings.extensions,
  'import-x/ignore': importSharedSettings.ignore,
};

/**
 * Rules governing how packages use ES module imports.
 *
 * Adapted from airbnb-base.
 * @satisfies {Linter.RulesRecord}
 */
export const importsRules = {
  'import/no-unresolved': ['error', { commonjs: true, caseSensitive: true }],
  'import/named': 'error',
  'import/export': 'error',
  'import/no-named-as-default': 'error',
  'import/no-named-as-default-member': 'error',
  'import/no-mutable-exports': 'error',
  'import/no-amd': 'error',
  'import/first': 'error',
  'import/no-duplicates': 'error',
  'import/newline-after-import': 'error',
  'import/no-absolute-path': 'error',
  'import/no-dynamic-require': 'error',
  'import/no-webpack-loader-syntax': 'error',
  'import/no-named-default': 'error',
  'import/no-self-import': 'error',
  'import/no-cycle': ['error', { maxDepth: '∞' }],
  'import/no-useless-path-segments': ['error', { commonjs: true }],
  'import/no-import-module-exports': ['error', { exceptions: [] }],
  'import/no-relative-packages': 'error',
  'import/extensions': ['error', 'always', { ignorePackages: true }],
  'import/no-extraneous-dependencies': [
    'error',
    {
      devDependencies: [
        '**/*.config.js',
        '**/*.config.*.js',
        '**/test/**',
        '**/*.test-d.ts',
        '**/demo*/**/*.js',
        '**/scripts/**/*.{js,mjs,cjs}',
      ],
    },
  ],
  'import/prefer-default-export': 'off',
};

// ---------------------------------------------------------------------------
// internal rules
// ---------------------------------------------------------------------------

/**
 * Top-level rules for the `internal` config (TypeScript-ESLint additions).
 *
 * @satisfies {Linter.RulesRecord}
 */
export const internalRules = {
  // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
  'import/no-unresolved': ['error', { ignore: ['ava'] }],
  '@typescript-eslint/naming-convention': [
    'error',
    {
      selector: 'interface',
      format: ['PascalCase'],
      custom: { regex: '.*I$', match: false },
    },
  ],
  'unicorn/numeric-separators-style': [
    'error',
    {
      onlyIfContainsSeparator: false,
      number: { minimumDigits: 5, groupLength: 3 },
      binary: { minimumDigits: 0, groupLength: 4 },
      octal: { minimumDigits: 0, groupLength: 4 },
      hexadecimal: { minimumDigits: 0, groupLength: 4 },
    },
  ],
};

/**
 * Rule overrides applied to `**\/*.ts` files within the `internal` config.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const internalTsOverrideRules = {
  'import/no-unresolved': 'off',
  'jsdoc/no-types': 'error',
  'jsdoc/require-param': 'off',
  'no-unused-vars': 'off',
};

/**
 * Type-checking rules enabled for all JS/TS files in the `internal` config.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const typeCheckingRules = {
  '@typescript-eslint/restrict-plus-operands': 'error',
};

/**
 * Downgraded type-checking rules for test files.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const typeCheckingTestRules = {
  '@typescript-eslint/restrict-plus-operands': 'warn',
};

// ---------------------------------------------------------------------------
// ses rules
// ---------------------------------------------------------------------------

/** Globals forbidden in SES bootstrap code (must not be accessed before lockdown). */
const sesRestrictedGlobalNames = /** @type {const} */ ([
  'AggregateError',
  'Array',
  'ArrayBuffer',
  'Atomics',
  'BigInt',
  'BigInt64Array',
  'BigUint64Array',
  'Boolean',
  'Compartment',
  'DataView',
  'Date',
  'Error',
  'EvalError',
  'Float16Array',
  'Float32Array',
  'Float64Array',
  'Function',
  'HandledPromise',
  'Int16Array',
  'Int32Array',
  'Int8Array',
  'JSON',
  'Map',
  'Math',
  'Number',
  'Object',
  'Promise',
  'Proxy',
  'RangeError',
  'ReferenceError',
  'Reflect',
  'RegExp',
  'Set',
  'SharedArrayBuffer',
  'String',
  'Symbol',
  'SyntaxError',
  'TypeError',
  'URIError',
  'Uint16Array',
  'Uint32Array',
  'Uint8Array',
  'Uint8ClampedArray',
  'WeakMap',
  'WeakSet',
  'assert',
  'decodeURI',
  'decodeURIComponent',
  'encodeURI',
  'encodeURIComponent',
  'escape',
  'eval',
  'globalThis',
  'isFinite',
  'isNaN',
  'lockdown',
  'parseFloat',
  'parseInt',
  'unescape',
]);

/**
 * Rules for the `ses` config — forbids dangerous globals and polymorphic calls.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const sesRules = {
  'no-restricted-globals': ['error', ...sesRestrictedGlobalNames],
  '@endo/no-polymorphic-call': 'error',
  'no-shadow-restricted-names': ['error', { reportGlobalThis: false }],
};

/**
 * Rule overrides relaxing `ses` restrictions in test/demo/script files.
 *
 * @satisfies {Linter.RulesRecord}
 */
export const sesTestOverrideRules = {
  ...sesRules,
  'no-restricted-globals': 'off',
  '@endo/no-polymorphic-call': 'off',
};
