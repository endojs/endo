/* eslint-env node */
const path = require('path');
const process = require('process');

const dynamicConfig = {
  overrides: [],
};

// Default to type-aware linting of "src" directories, but allow opting out
// or opting in all code (the latter of which can be too slow even for CI per
// https://github.com/Agoric/agoric-sdk/issues/5788 ).
// * `ENDO_LINT_TYPES=NONE`: Linting is type-ignorant.
// * `ENDO_LINT_TYPES=SRC`: Linting of "src" directories is type-aware (default,
//   increases time ~50%).
// * `ENDO_LINT_TYPES=FULL`: Linting of all files is type-aware (increases time greatly).
const explicitLintTypes = process.env.ENDO_LINT_TYPES;
const lintTypes = explicitLintTypes ?? 'SRC';
const validLintTypesValues = ['NONE', 'SRC', 'FULL'];
if (!validLintTypesValues.includes(lintTypes)) {
  // Intentionally avoid a SES `assert` dependency.
  const expected = JSON.stringify(validLintTypesValues);
  const actual = JSON.stringify(lintTypes);
  throw new RangeError(
    `ENDO_LINT_TYPES must be one of ${expected}, not ${actual}`,
  );
}
if (explicitLintTypes) {
  console.log(`type-aware linting: ${explicitLintTypes}`);
}
if (lintTypes !== 'NONE') {
  const isFull = lintTypes === 'FULL';

  // typescript-eslint has its own config that must be dynamically referenced
  // to include vs. exclude non-"src" files because it cannot itself be dynamic.
  // https://github.com/microsoft/TypeScript/issues/30751
  const rootTsProjectGlob = isFull
    ? './{js,ts}config.eslint-full.json'
    : './{js,ts}config.eslint-src.json';
  const parserOptions = {
    tsconfigRootDir: path.join(__dirname, '../..'),
    project: [rootTsProjectGlob, 'packages/*/{js,ts}config.eslint.json'],
  };

  const fileGlobs = isFull ? ['**/*.{js,ts}'] : ['**/src/**/*.{js,ts}'];
  const rules = {
    '@typescript-eslint/restrict-plus-operands': 'error',
  };

  dynamicConfig.overrides.push({
    extends: ['plugin:@endo/recommended-requiring-type-checking'],
    files: fileGlobs,
    parserOptions,
    rules,
  });
  // Downgrade restrict-plus-operands to a warning for test files
  // until we have time to clean them up.
  if (isFull) {
    dynamicConfig.overrides.push({
      files: ['**/test/**/*.{js,ts}'],
      rules: {
        '@typescript-eslint/restrict-plus-operands': 'warn',
      },
    });
  }
}

module.exports = {
  extends: [
    'airbnb-base',
    'prettier',
    'plugin:jsdoc/recommended',
    'plugin:@jessie.js/recommended',
    'plugin:@endo/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: {
    quotes: [
      'error',
      'single',
      {
        avoidEscape: true,
        allowTemplateLiterals: true,
      },
    ],
    'comma-dangle': ['error', 'always-multiline'],
    'implicit-arrow-linebreak': 'off',
    'function-paren-newline': 'off',
    'arrow-parens': 'off',
    strict: 'off',
    'prefer-destructuring': 'off',
    'no-else-return': 'off',
    'no-console': 'off',
    'no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'no-return-assign': 'off',
    'no-param-reassign': 'off',
    'no-restricted-syntax': ['off', 'ForOfStatement'],
    'no-unused-expressions': 'off',
    'no-loop-func': 'off',
    'no-inner-declarations': 'off',
    'guard-for-in': 'error',
    'import/extensions': 'off',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.config.js',
          '**/*.config.*.js',
          '*test*/**/*.js',
          'demo*/**/*.js',
          'scripts/**/*.js',
        ],
      },
    ],

    // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
    'import/no-unresolved': ['error', { ignore: ['ava'] }],
    'import/prefer-default-export': 'off',

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
    'dist/**',
    'test262/**',
    'ava*.config.js',
  ],
};
