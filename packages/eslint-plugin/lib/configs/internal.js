/* eslint-env node */
const path = require('path');

// typescript-eslint has its own config that must be dynamically referenced
// to include vs. exclude non-"src" files because it cannot itself be dynamic.
// https://github.com/microsoft/TypeScript/issues/30751
const rootTsProjectGlob = './tsconfig.eslint-full.json';
const parserOptions = {
  useProjectService: true,
  sourceType: 'module',
  projectService: {
    allowDefaultProject: ['*.js'],
    defaultProject: 'tsconfig.json',
  },
  tsconfigRootDir: path.join(__dirname, '../../../..'),
  project: [rootTsProjectGlob],
};

const fileGlobs = ['**/*.{js,ts}'];
const rules = {
  '@typescript-eslint/restrict-plus-operands': 'error',
};

module.exports = [
  // Base configuration
  {
    languageOptions: {
      parserOptions,
    },
    rules: {
      // Work around https://github.com/import-js/eslint-plugin-import/issues/1810
      'import/no-unresolved': ['error', { ignore: ['ava'] }],
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
  },
  // Type checking config for specific files
  {
    files: fileGlobs,
    ignores: ['**/src*/**/exports.js'],
    languageOptions: {
      parserOptions,
    },
    rules,
  },
  // Downgrade restrict-plus-operands to a warning for test files
  // until we have time to clean them up.
  {
    files: ['**/test/**/*.{js,ts}'],
    rules: {
      '@typescript-eslint/restrict-plus-operands': 'warn',
    },
  },
  // General file overrides
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
  // Global ignores
  {
    ignores: [
      '**/output/**',
      'bundles/**',
      'coverage/**',
      'dist/**',
      'tmp/**',
      'test262/**',
      'ava*.config.js',
    ],
  },
];
