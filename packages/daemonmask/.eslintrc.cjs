module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },

    {
      files: ['*.js', '*.cjs', '!src/ui/**/*'],
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['src/ui/**/*.js'],
      extends: ['@metamask/eslint-config-browser'],
    },

    {
      files: ['*.js'],
      parserOptions: {
        ecmaVersion: '2022',
        sourceType: 'module',
      },
      rules: {
        'import/extensions': ['error', 'ignorePackages'],
        'import/no-unresolved': 'off',
        'import/no-useless-path-segments': 'off',
      },
    },

    {
      files: ['*.test.js'],
      rules: {
        'id-length': [
          'error',
          {
            min: 2,
            properties: 'never',
            exceptionPatterns: ['_', 'a', 'b', 'i', 'j', 'k', 't'],
          },
        ],
      },
    },

    {
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
      },
    },
  ],

  ignorePatterns: [
    '!.eslintrc.cjs',
    '!.prettierrc.cjs',
    '.yarn/',
    'coverage/',
    'dist/',
    'docs/',
  ],
};
