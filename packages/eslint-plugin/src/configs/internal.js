import {
  ignorePatterns,
  internalRules,
  internalTsOverrideRules,
  projectServiceOptions,
  tsconfigRootDir,
  typeCheckingRules,
  typeCheckingTestRules,
} from './shared.js';

/**
 * Legacy eslintrc-style `internal` config — the opinionated baseline used by
 * packages within the Endo monorepo itself.
 *
 * Extends `strict` and adds TypeScript-ESLint parser/plugin and prettier.
 * This is not intended for use outside Endo.
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  extends: ['prettier', 'plugin:@endo/strict'],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'unicorn'],
  rules: internalRules,
  overrides: [
    {
      files: ['**/*.ts'],
      rules: internalTsOverrideRules,
    },
    {
      extends: ['plugin:@endo/recommended-requiring-type-checking'],
      files: ['**/*.{js,ts}'],
      excludedFiles: ['**/src*/**/exports.js'],
      parserOptions: {
        ...projectServiceOptions,
        sourceType: 'module',
        tsconfigRootDir,
      },
      rules: typeCheckingRules,
    },
    {
      files: ['**/test/**/*.{js,ts}'],
      rules: typeCheckingTestRules,
    },
  ],
  ignorePatterns,
};
