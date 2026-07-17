import js from '@eslint/js';
import stylisticPlugin from '@stylistic/eslint-plugin';
import tsEslintPlugin from '@typescript-eslint/eslint-plugin';
import tsEslintParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import unicornPlugin from 'eslint-plugin-unicorn';
import daemon from './configs/daemon.js';
import imports from './configs/imports.js';
import internal from './configs/internal.js';
import recommendedRequiringTypeChecking from './configs/recommended-requiring-type-checking.js';
import recommended from './configs/recommended.js';
import ses from './configs/ses.js';
import {
  hardenedGlobals,
  ignorePatterns,
  importsRules,
  importsSettings,
  internalRules,
  internalTsOverrideRules,
  projectServiceOptions,
  recommendedRules,
  sesRules,
  sesTestOverrideRules,
  styleRules,
  styleSettings,
  styleTsOverrideRules,
  stylisticRules,
  tsconfigRootDir,
  typeCheckingRules,
  typeCheckingTestRules,
} from './configs/shared.js';
import strict from './configs/strict.js';
import style from './configs/style.js';
import assertFailAsThrow from './rules/assert-fail-as-throw.js';
import hardenExports from './rules/harden-exports.js';
import noAssignToExportedLetVarOrFunction from './rules/no-assign-to-exported-let-var-or-function.js';
import noHardenPatternMaker from './rules/no-harden-pattern-maker.js';
import noMultiNameLocalExport from './rules/no-multi-name-local-export.js';
import noPolymorphicCall from './rules/no-polymorphic-call.js';
import restrictComparisonOperands from './rules/restrict-comparison-operands.js';

/**
 * @import {ConfigWithExtends} from 'typescript-eslint';
 */

// --------------------------------------------------------------------------
// Plugin assembly
// --------------------------------------------------------------------------

export const meta = {
  name: '@endo/eslint-plugin',
};

export const rules = {
  'assert-fail-as-throw': assertFailAsThrow,
  'harden-exports': hardenExports,
  'no-assign-to-exported-let-var-or-function':
    noAssignToExportedLetVarOrFunction,
  'no-harden-pattern-maker': noHardenPatternMaker,
  'no-multi-name-local-export': noMultiNameLocalExport,
  'no-polymorphic-call': noPolymorphicCall,
  'restrict-comparison-operands': restrictComparisonOperands,
};

// Build the plugin object before the configs so the flat configs can
// embed a self-reference without a circular import.

const plugin = { meta, rules };

// --------------------------------------------------------------------------
// Flat config factory functions
// --------------------------------------------------------------------------

/** @type {Record<string, ConfigWithExtends[]>} */
const flatConfigs = {};

/** @returns {ConfigWithExtends[]} */
const makeFlatRecommended = () => [
  js.configs.recommended,
  {
    plugins: { '@endo': plugin, unicorn: unicornPlugin },
    languageOptions: {
      globals: hardenedGlobals,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: recommendedRules,
  },
];

/** @returns {ConfigWithExtends[]} */
const makeFlatStyle = () => [
  jsdocPlugin.configs['flat/recommended-typescript-flavor'],
  prettierConfig,
  {
    plugins: { '@stylistic': stylisticPlugin },
    settings: styleSettings,
    // stylisticRules is separate from styleRules so @stylistic/* never flows
    // through legacy FlatCompat paths where the plugin isn't resolvable.
    rules: { ...stylisticRules, ...styleRules },
  },
  {
    files: ['**/*.ts'],
    rules: styleTsOverrideRules,
  },
];
/** @returns {ConfigWithExtends[]} */
const makeFlatImports = () => [
  {
    plugins: { import: importPlugin },
    settings: importsSettings,
    rules: importsRules,
  },
];
/** @returns {ConfigWithExtends[]} */
const makeFlatStrict = () => [
  // Recommended comes first so that style and imports rules can override it.
  // This matters because js.configs.recommended (now part of recommended) sets
  // rules like no-fallthrough:'error' that endo deliberately relaxes to 'warn'.
  ...(flatConfigs.recommended ??= makeFlatRecommended()),
  ...(flatConfigs.imports ??= makeFlatImports()),
  ...(flatConfigs.style ??= makeFlatStyle()),
];

const makeFlatInternal = () => [
  ...(flatConfigs.strict ??= makeFlatStrict()),
  {
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ...projectServiceOptions,
        tsconfigRootDir,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
    },
    rules: internalRules,
  },
  {
    files: ['**/*.ts'],
    rules: internalTsOverrideRules,
  },
  {
    files: ['**/*.{js,ts}'],
    ignores: ['**/src*/**/exports.js'],
    languageOptions: {
      parser: tsEslintParser,
      parserOptions: {
        ...projectServiceOptions,
      },
    },
    plugins: {
      '@typescript-eslint': tsEslintPlugin,
    },
    rules: typeCheckingRules,
  },
  {
    files: ['**/test/**/*.{js,ts}'],
    rules: typeCheckingTestRules,
  },
  {
    ignores: ignorePatterns,
  },
];
/** @returns {ConfigWithExtends[]} */
const makeFlatSes = () => [
  ...(flatConfigs.internal ??= makeFlatInternal()),
  {
    plugins: { '@endo': plugin },
    rules: sesRules,
  },
  {
    files: ['**/test/**/*.js', '**/demos/**/*.js', '**/scripts/**/*.js'],
    rules: sesTestOverrideRules,
  },
];
/** @returns {ConfigWithExtends[]} */
const makeFlatRecommendedRequiringTypeChecking = () => [
  ...(flatConfigs.recommended ??= makeFlatRecommended()),
  {
    plugins: { '@endo': plugin },
    rules: { '@endo/restrict-comparison-operands': 'error' },
  },
];

// --------------------------------------------------------------------------
// Plugin configs
// --------------------------------------------------------------------------

plugin.configs = {
  // Legacy eslintrc configs (ESLint 8 compatible)
  recommended,
  'recommended-requiring-type-checking': recommendedRequiringTypeChecking,
  internal,
  strict,
  style,
  imports,
  ses,
  daemon,

  // Flat configs (ESLint 9+) — accessed via lazy getters.
  get 'flat/recommended'() {
    return (flatConfigs.recommended ??= makeFlatRecommended());
  },
  get 'flat/recommended-requiring-type-checking'() {
    return (flatConfigs.recommendedRequiringTypeChecking ??=
      makeFlatRecommendedRequiringTypeChecking());
  },
  get 'flat/style'() {
    return (flatConfigs.style ??= makeFlatStyle());
  },
  get 'flat/imports'() {
    return (flatConfigs.imports ??= makeFlatImports());
  },
  get 'flat/strict'() {
    return (flatConfigs.strict ??= makeFlatStrict());
  },
  get 'flat/internal'() {
    return (flatConfigs.internal ??= makeFlatInternal());
  },
  get 'flat/ses'() {
    return (flatConfigs.ses ??= makeFlatSes());
  },
  get 'flat/daemon'() {
    // Deprecated alias for flat/internal.
    return (flatConfigs.internal ??= makeFlatInternal());
  },
};

// Expose configs as a named export so the legacy eslintrc plugin loader
// (which reads module.rules and module.configs from the module namespace)
// can access it without going through the default export.
export const { configs } = plugin;
export { hardenedGlobals };
export default plugin;
