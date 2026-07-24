// @ts-check
import { OptionDefaults } from 'typedoc';
import { configs as endoConfigs, hardenedGlobals } from '@endo/eslint-plugin';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import jessieNoNestedAwait from '@jessie.js/eslint-plugin/lib/rules/no-nested-await.js';
import jessieSafeAwaitSeparator from '@jessie.js/eslint-plugin/lib/rules/safe-await-separator.js';
import jessieUseJessieProcessor from '@jessie.js/eslint-plugin/lib/processors/use-jessie.js';
import eslintPluginPlugin from 'eslint-plugin-eslint-plugin';

// The published Jessie config eagerly constructs a legacy FlatCompat instance.
// That instance cannot resolve Endo's restored `eslint:recommended` baseline
// under ESLint 10, so wire the small Jessie flat surface directly instead.
const jessiePlugin = {
  meta: { name: '@jessie.js/eslint-plugin', version: '0.4.3' },
  rules: {
    'no-nested-await': jessieNoNestedAwait,
    'safe-await-separator': jessieSafeAwaitSeparator,
  },
};

// The Jessie processor predates ESLint's required processor metadata.
// Keep its behavior while supplying the metadata used by `--print-config`.
const jessieProcessor = {
  ...jessieUseJessieProcessor,
  meta: { name: '@jessie.js/use-jessie' },
};

const importResolverSettingsFor = condition => ({
  'import/resolver': {
    exports: { conditions: [condition] },
    node: {},
  },
  'import-x/resolver': {
    exports: { conditions: [condition] },
    node: {},
  },
});

export default defineConfig(
  // jessie config comes first since it imports the "strict" config from @endo/eslint-plugin;
  // subsequent configs are applied in order
  {
    plugins: { '@jessie.js': jessiePlugin },
    rules: { '@jessie.js/safe-await-separator': 'warn' },
    processor: jessieProcessor,
  },
  endoConfigs['flat/internal'],

  // packages which use the "ses" config scheme
  {
    files: [
      'packages/ses/**',
      'packages/env-options/**',
      'packages/immutable-arraybuffer/**',
      'packages/cache-map/**',
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
          devDependencies: ['**/test/**', '**/*.test-d.ts'],
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

  // package-specific export conditions used by resolver fixtures
  {
    files: ['packages/eventual-send-test/**'],
    settings: importResolverSettingsFor('test-endo-eventual-send'),
  },
  {
    files: ['packages/harden-test/**'],
    settings: importResolverSettingsFor('test-endo-harden'),
  },
  {
    files: ['packages/hex-test/**'],
    settings: importResolverSettingsFor('test-endo-hex'),
  },
  {
    files: ['packages/ses-test/**'],
    settings: importResolverSettingsFor('test-endo-ses'),
  },

  // packages/dirs where Node.js globals are used
  {
    files: [
      'packages/ses-ava/**',
      'packages/*/test/**',
      'packages/cli/**',
      'packages/eslint-plugin/**',
      'packages/chat/playwright.config.ts',
      'browser-test/**/*',
      'packages/compartment-mapper/demo/**',
      '**/scripts/**/*',
    ],
    languageOptions: {
      globals: { ...hardenedGlobals, ...globals.node },
    },
  },

  // packages whose sources run in a browser realm
  {
    files: [
      'packages/chat/**',
      'packages/monaco-wrapper/**',
      'packages/preact-container/**',
      'packages/space-channel/**',
      'packages/space-chat/**',
      'packages/space-file-explorer/**',
      'packages/space-floot/**',
      'packages/space-inventory-graph/**',
      'packages/space-peers/**',
      'packages/space-whylip/**',
      'packages/spaces-util/**',
    ],
    languageOptions: {
      globals: { ...hardenedGlobals, ...globals.browser },
    },
  },

  // fork-package policy formerly carried in package.json eslintConfig fields
  {
    files: ['packages/familiar/**'],
    rules: {
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['packages/familiar/scripts/*.mjs'],
    rules: {
      '@endo/harden-exports': 'off',
    },
  },
  {
    files: ['packages/goblin-chat/**'],
    rules: {
      'import/no-unresolved': [
        'error',
        { ignore: ['ava', '^@endo/ocapn(?:/.*)?$'] },
      ],
    },
  },
  {
    files: ['packages/module-source/**'],
    rules: {
      'import/no-unresolved': [
        'error',
        { ignore: ['^@endo/module-source(?:/.*)?$'] },
      ],
      'jsdoc/check-tag-names': ['error', { definedTags: ['privateRemarks'] }],
    },
  },
  {
    files: ['packages/module-source/**/*.ts'],
    rules: {
      'vars-on-top': 'off',
      'no-var': 'off',
    },
  },
  {
    files: ['packages/ocapn-noise/**'],
    rules: {
      'import/no-unresolved': [
        'error',
        {
          ignore: ['^@endo/ocapn/', '^@endo/ocapn-noise/', '^@endo/ses-ava/'],
        },
      ],
    },
  },
  {
    files: ['packages/preact-container/**'],
    rules: {
      'no-underscore-dangle': 'off',
      'no-bitwise': 'off',
      'no-continue': 'off',
      'no-plusplus': 'off',
      'no-control-regex': 'off',
      '@endo/restrict-comparison-operands': 'off',
    },
  },
  {
    files: ['packages/daemon/src/bus-xs-host-globals.d.ts'],
    rules: {
      // Ambient declarations intentionally use `declare var` for host globals.
      'no-var': 'off',
    },
  },
  {
    files: ['packages/compartment-mapper/demo/**'],
    rules: {
      // The demo resolves its policy fixtures and self-package imports at
      // runtime, rather than through the demo directory's package boundary.
      'import/no-extraneous-dependencies': 'off',
      'no-restricted-globals': 'off',
    },
  },
  {
    files: ['packages/*/test/*fixture*/**/*.cjs'],
    rules: {
      // These fixtures deliberately exercise CommonJS and transpiler output.
      camelcase: 'off',
      'global-require': 'off',
      'no-useless-return': 'off',
      'no-var': 'off',
    },
  },
  {
    files: [
      'packages/preact-container/test/**/*.js',
      'packages/preact-container/vitest.config.mjs',
    ],
    languageOptions: {
      globals: {
        ...hardenedGlobals,
        ...globals.browser,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        expect: 'readonly',
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-plusplus': 'off',
      'no-script-url': 'off',
      'no-extend-native': 'off',
      'no-restricted-globals': 'off',
      'max-classes-per-file': 'off',
      'class-methods-use-this': 'off',
      'import/no-extraneous-dependencies': 'off',
      'no-shadow': 'off',
    },
  },

  // scripts are a little loosey-goosey
  {
    files: ['scripts/**/*'],
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

  // allow any tag supported by TypeDoc
  {
    files: ['packages/**'],
    rules: {
      'jsdoc/check-tag-names': [
        'error',
        {
          // these tags from TypeDoc all begin with @ which the eslint plugin
          // doesn't expect
          definedTags: [
            ...OptionDefaults.blockTags,
            ...OptionDefaults.modifierTags,
          ].map(tag => tag.slice(1)),
          inlineTags: OptionDefaults.inlineTags.map(tag => tag.slice(1)),
        },
      ],
    },
  },

  // Repository-wide ignores formerly provided by .eslintignore.
  {
    ignores: [
      'api-docs/',
      'rust/',
      '**/*.json',
      'packages/test262-runner/prelude/',
      'packages/chat/test/**/probe.mjs',
      'packages/chat/test/**/run.mjs',
      'packages/daemon/scripts/*.mjs',
      'packages/thixotrope/dist-xs/',
      'packages/thixotrope/scripts/*.mjs',
      'packages/familiar/preload.mjs',
      'packages/git/src/git-askpass-helper.cjs',
      'packages/x402/demo/verify.mjs',
      'packages/base64/types/',
      'packages/bundle-source/scripts/',
      'packages/familiar/out/',
      'packages/module-source/test/fixtures/',
      'packages/module-source/src/external.types.js',
      'packages/pass-style/src/types.js',
      'packages/nat/integration-test/',
      'packages/captp/scripts/',
      'packages/marshal/src/bundles/',
      'packages/bundle-source/demo/',
      'packages/init/**/bundle-*.js',
    ],
  },
);
