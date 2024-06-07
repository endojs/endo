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
        sourceType: 'module',
      },
    },

    {
      files: ['*.cjs'],
      parserOptions: {
        sourceType: 'script',
      },
    },

    {
      files: ['*.test.ts', '*.test.js'],
      extends: [
        '@metamask/eslint-config-jest',
        '@metamask/eslint-config-nodejs',
      ],
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
