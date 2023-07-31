/* eslint-env node */
const path = require('path');
const process = require('process');

const dynamicConfig = {
  overrides: /** @type {*[]} */ ([]),
};

// typescript-eslint has its own config that must be dynamically referenced
// to include vs. exclude non-"src" files because it cannot itself be dynamic.
// https://github.com/microsoft/TypeScript/issues/30751
const rootTsProjectGlob = './{js,ts}config.eslint-full.json';
const parserOptions = {
  tsconfigRootDir: path.join(__dirname, '../../../..'),
  project: [rootTsProjectGlob, 'packages/*/{js,ts}config.eslint.json'],
};

const fileGlobs = ['**/*.{js,ts}'];
const rules = {
  '@typescript-eslint/restrict-plus-operands': 'error',
};

dynamicConfig.overrides.push({
  extends: ['plugin:@endo/recommended-requiring-type-checking'],
  files: fileGlobs,
  excludedFiles: ['**/src/**/exports.js'],
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
  plugins: ['@typescript-eslint'],
  rules: {
    // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
    'import/no-unresolved': ['error', { ignore: ['ava'] }],
  },
  overrides: [
    {
      files: ['**/*.{js,ts}'],
    },
    {
      files: ['**/*.ts'],
      rules: {
        'import/no-unresolved': 'off',
        'no-unused-vars': 'off',
      },
    },
    ...dynamicConfig.overrides,
  ],
  ignorePatterns: [
    '**/output/**',
    'bundles/**',
    'coverage/**',
    'dist/**',
    'test262/**',
    'ava*.config.js',
  ],
};
