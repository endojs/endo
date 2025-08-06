// ESLint flat config for Endo
// This is a simplified approach that manually converts the legacy config

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import importPlugin from 'eslint-plugin-import';
import jessie from '@jessie.js/eslint-plugin';
import endoPlugin from '@endo/eslint-plugin';

export default [
  // Apply base recommended rules
  js.configs.recommended,
  
  // Apply TypeScript ESLint rules 
  ...tseslint.configs.recommended,
  
  // Apply Prettier config (disables conflicting rules)
  prettier,
  
  // Global configuration
  {
    plugins: {
      jsdoc,
      import: importPlugin,
      '@jessie.js': jessie,
      '@endo': endoPlugin,
    },
    
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // SES/Endo globals from the original recommended.js config
        assert: 'readonly',
        console: 'readonly',
        Compartment: 'readonly',
        ModuleSource: 'readonly',
        TextDecoder: 'readonly', 
        TextEncoder: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        
        // Constructor Properties of the Global Object (SES whitelist)
        Array: 'readonly',
        ArrayBuffer: 'readonly',
        BigInt: 'readonly',
        BigInt64Array: 'readonly',
        BigUint64Array: 'readonly',
        Boolean: 'readonly',
        DataView: 'readonly',
        EvalError: 'readonly',
        Float32Array: 'readonly',
        Float64Array: 'readonly',
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
        
        // Other Properties of the Global Object
        JSON: 'readonly',
        Reflect: 'readonly',
        
        // Annex B
        escape: 'readonly',
        unescape: 'readonly',
        
        // ESNext/Endo specific
        lockdown: 'readonly',
        harden: 'readonly',
        HandledPromise: 'readonly',
        AggregateError: 'readonly',
      },
    },
    
    rules: {
      // Style rules from the original config
      'quotes': ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
      'comma-dangle': ['error', 'always-multiline'],
      'consistent-return': 'warn',
      'no-fallthrough': 'warn',
      'arrow-body-style': 'off',
      'prefer-arrow-callback': 'off',
      'strict': 'off',
      'prefer-destructuring': 'off',
      'prefer-regex-literals': 'off',
      'no-else-return': 'off',
      'no-console': 'off',
      'no-return-assign': 'off',
      'no-param-reassign': 'off',
      'no-promise-executor-return': 'off',
      'no-restricted-syntax': 'off',
      'no-unused-expressions': 'off',
      'no-loop-func': 'off',
      'no-inner-declarations': 'off',
      
      // Unused vars rule
      'no-unused-vars': ['error', {
        args: 'none',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      
      // Import rules
      'import/extensions': ['error', 'always', { ignorePackages: true }],
      'import/no-extraneous-dependencies': ['error', {
        devDependencies: [
          '**/*.config.js',
          '**/*.config.*.js',
          '**/test/**',
          '**/demo*/**/*.js',
          '**/scripts/**/*.js',
        ],
      }],
      'import/prefer-default-export': 'off',
      'import/no-unresolved': ['error', { ignore: ['ava'] }],
      
      // JSDoc rules  
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
      
      // Jessie.js rules (set as warn to avoid breaking build)  
      '@jessie.js/safe-await-separator': 'warn',
      
      // Endo-specific rules (only the ones used in recommended/strict configs)
      '@endo/assert-fail-as-throw': 'error',
    },
    
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
  },
  
  // TypeScript specific overrides
  {
    files: ['**/*.ts'],
    rules: {
      'import/no-unresolved': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'none',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      // Relax some strict TypeScript rules to match original config behavior
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unnecessary-type-constraint': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
    },
  },
  
  // JavaScript specific overrides (also apply TS rules to JS)
  {
    files: ['**/*.js'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {
        args: 'none',
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  
  // ESLint config file itself
  {
    files: ['eslint.config.js'],
    rules: {
      'import/no-extraneous-dependencies': 'off',
      'import/no-unresolved': 'off',
    },
  },
  
  // TypeScript declaration test files (*.test-d.ts) are more permissive
  {
    files: ['**/*.test-d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-vars': 'off',
    },
  },
  
  // Global ignores (replaces .eslintignore)
  {
    ignores: [
      'coverage/',
      'build/',
      'dist/',
      'api-docs/',
      '**/*.json',
      '**/*.d.ts',
      '**/*.d.cts', 
      '**/*.d.mts',
      '!**/*.types.d.ts',
      '!**/*.types.d.mts',
      '!**/*.types.d.cts',
      '!packages/bundle-source/src/exports.d.ts',
      '!packages/captp/src/ts-types.d.ts',
      '!packages/cli/test/_types.d.ts',
      '!packages/compartment-mapper/src/types-external.d.ts',
      '!packages/compartment-mapper/src/types.d.ts',
      '!packages/daemon/src/types.d.ts',
      '!packages/daemon/types.d.ts',
      '!packages/eventual-send/src/exports.d.ts',
      '!packages/eventual-send/src/types.d.ts',
      '!packages/exo/src/types.d.ts',
      '!packages/far/src/exports.d.ts',
      '!packages/lp32/types.d.ts',
      '!packages/pass-style/src/types.d.ts',
      '!packages/ses/src/reporting-types.d.ts',
      '!packages/ses/types.d.ts',
      '!packages/stream/types.d.ts',
      '!packages/trampoline/types.d.ts',
      '!packages/where/types.d.ts',
      // Ignore test262 directory which has non-standard test files
      '**/test262/**',
      // Ignore output directories
      '**/output/**',
      'bundles/**',
      'tmp/**',
    ],
  },
  
  // CommonJS files (.cjs) need Node.js environment
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  
  // Node.js script files need Node.js environment
  {
    files: ['scripts/**/*.{js,mjs,cjs}', 'browser-test/**/*.js'],
    languageOptions: {
      globals: {
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        require: 'readonly',
        module: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'import/no-extraneous-dependencies': 'off',
      'no-undef': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
    },
  },
];