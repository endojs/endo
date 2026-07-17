// @ts-check
import { configs as endoConfigs, hardenedGlobals } from '@endo/eslint-plugin';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import jessie from '@jessie.js/eslint-plugin';
import eslintPluginPlugin from 'eslint-plugin-eslint-plugin';

export default defineConfig(
  // jessie config comes first since it imports the "strict" config from @endo/eslint-plugin;
  // subsequent configs are applied in order
  {
    // @ts-expect-error - untyped
    extends: [jessie.configs['flat/recommended']],
    processor: jessie.processors['use-jessie'],
  },
  endoConfigs['flat/internal'],

  // packages which use the "ses" config scheme
  {
    files: [
      'packages/ses/**',
      'packages/env-options/**',
      'packages/immutable-arraybuffer/**',
    ],
    extends: [endoConfigs['flat/ses']],
  },

  // packages which use the "daemon" config scheme
  {
    files: ['packages/cli/**', 'packages/daemon/**'],
    extends: [endoConfigs['flat/daemon']],
  },

  // override resolution for certain dev deps which are resolved from the workspace root instead
  {
    files: ['packages/*/test/**', 'packages/**/*.test-d.ts'],
    rules: {
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: ['packages/*/test/**', 'packages/**/*.test-d.ts'],
          whitelist: ['ava', 'tsd', 'typescript'],
        },
      ],
    },
  },

  // specific to @endo/eslint-plugin
  {
    files: ['packages/eslint-plugin/**'],
    extends: [eslintPluginPlugin.configs.recommended],
  },
  {
    files: ['packages/eslint-plugin/test/**/*.js'],
    extends: [eslintPluginPlugin.configs['tests-recommended']],
  },

  // packages/dirs where Node.js globals are used
  {
    files: [
      'packages/ses-ava/**',
      'packages/*/test/**',
      'packages/cli/**',
      'packages/eslint-plugin/**',
      'browser-test/**/*',
      '**/scripts/**/*',
    ],
    languageOptions: {
      globals: { ...hardenedGlobals, ...globals.node },
    },
  },

  // scripts are a little loosey-goosey
  {
    files: ['**/scripts/**/*'],
    rules: {
      '@jessie.js/safe-await-separator': 'off',
      'no-await-in-loop': 'off',
      'no-continue': 'off',
      'no-shadow': 'off',
      'no-empty': 'off',
    },
  },

  // force CommonJS
  {
    files: ['browser-test/**/*'],
    languageOptions: {
      sourceType: 'script',
    },
  },

  // overrides for tsd tests
  {
    files: ['**/*.test-d.ts'],
    rules: {
      'no-useless-assignment': 'off',
      'no-restricted-globals': 'off',
      '@endo/no-polymorphic-call': 'off',
    },
  },

  // .eslintignore
  {
    ignores: [
      'api-docs/',
      'packages/nat/integration-test/',
      'packages/captp/scripts/',
      'packages/marshal/src/bundles/',
      'packages/ses/test/_**',
      'packages/bundle-source/demo/',
      'packages/*/test/*fixture*/',
      'packages/init/**/bundle-*.js',
      'packages/compartment-mapper/demo/**',
    ],
  },
);
