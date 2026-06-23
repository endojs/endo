/* eslint-env node */
const path = require('path');

const dynamicConfig = {
  overrides: /** @type {*[]} */ ([]),
};

// typescript-eslint 8.59 deprecates `parserOptions.project` when
// `projectService` is enabled. Keeping both produces:
//   "Parsing error: Enabling 'project' does nothing when
//    'projectService' is enabled. You can remove the 'project' setting"
// Drop `project` and rely on `projectService` to discover tsconfigs.
const parserOptions = {
  useProjectService: true,
  sourceType: 'module',
  projectService: {
    allowDefaultProject: ['*.js'],
    defaultProject: 'tsconfig.json',
  },
  tsconfigRootDir: path.join(__dirname, '../../../..'),
};

const fileGlobs = ['**/*.{js,ts}'];
const rules = {
  '@typescript-eslint/restrict-plus-operands': 'error',
};

dynamicConfig.overrides.push({
  extends: ['plugin:@endo/recommended-requiring-type-checking'],
  files: fileGlobs,
  excludedFiles: ['**/src*/**/exports.js'],
  parserOptions,
  rules,
});
// Downgrade restrict-plus-operands to a warning for test files
// until we have time to clean them up.
dynamicConfig.overrides.push({
  files: ['**/test/**/*.{js,ts}'],
  rules: {
    '@typescript-eslint/restrict-plus-operands': 'warn',
  },
});

module.exports = {
  extends: ['prettier', 'plugin:@jessie.js/recommended', 'plugin:@endo/strict'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'unicorn'],
  rules: {
    'no-void': 'off',
    'no-use-before-define': 'off',
    'no-nested-ternary': 'off',
    // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
    'import/no-unresolved': ['error', { ignore: ['ava'] }],
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
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'interface',
        format: ['PascalCase'],
        custom: {
          regex: '.*I$',
          match: false,
        },
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.ts'],
      rules: {
        'import/no-unresolved': 'off',
        'jsdoc/no-types': 'error', // sign of an incomplete migration to TypeScript
        'jsdoc/require-param': 'off',
        'no-unused-vars': 'off',
      },
    },
    ...dynamicConfig.overrides,
  ],
  // Ignore patterns that must apply to package sources belong here, in the
  // shared config, rather than in a `.eslintignore` file. ESLint only loads
  // the `.eslintignore` adjacent to its working directory, so a root
  // `.eslintignore` is honored when CI runs `eslint .` from the repo root but
  // is invisible when a contributor runs `yarn lint` inside a single package
  // (and a per-package `.eslintignore` is the reverse: honored locally,
  // ignored by the root run). That split makes local lint pass while CI fails,
  // or vice-versa. Config `ignorePatterns` are resolved per-file regardless of
  // the working directory, so root and single-package lint runs agree on the
  // ignore set. `**/`-prefixed globs keep matching independent of the directory
  // ESLint is invoked from.
  //
  // The repo-root `.eslintignore` is still required for paths that live outside
  // any package (e.g. `rust/`, `api-docs/`, `browser-test/`): the root
  // package.json sets `root: true` with no `extends`, so files there never see
  // this config. Keep the two lists in agreement for those root-level paths.
  ignorePatterns: [
    '**/output/**',
    '**/bundles/**',
    '**/coverage/**',
    '**/build/**',
    '**/dist/**',
    '**/api-docs/**',
    '**/browser-test/**',
    '**/*.json',
    '**/*.d.ts*',
    '**/*.d.cts*',
    '**/*.d.mts*',
    // `*.types.d.*` files are hand-authored and must stay linted; re-include
    // them after the broad `*.d.*` ignore above.
    '!**/*.types.d.ts',
    '!**/*.types.d.cts',
    '!**/*.types.d.mts',
    // `*.types.js` confuses typescript-eslint; ignore until the eslint/tseslint
    // upgrade that fixes it.
    '**/*.types.js',
    '**/tmp/**',
    '**/test262/**',
    'ava*.config.js',
  ],
};
