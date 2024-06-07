module.exports = {
  root: true,

  extends: ['@metamask/eslint-config'],

  overrides: [
    {
      files: ['*.ts'],
      extends: ['@metamask/eslint-config-typescript'],
    },

    {
      files: ['*.js', '*.cjs'],
      extends: ['@metamask/eslint-config-nodejs'],
    },

    {
      files: ['*.js'],
      parserOptions: {
        ecmaVersion: '2022',
        sourceType: 'module',
      },
      rules: {
        'import/no-unresolved': 'off',
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

    // {
    //   files: ['*.test.ts', '*.test.js'],
    //   extends: [
    //     '@metamask/eslint-config-nodejs',
    //   ],
    // },
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
