module.exports = [
  {
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

      'consistent-return': 'warn', // some bugs. TS covers.
      'no-fallthrough': 'warn', // doesn't detect throws

      'arrow-body-style': 0,
      'prefer-arrow-callback': 0,

      strict: 'off',
      'prefer-destructuring': 'off',
      'prefer-regex-literals': 'off',
      'no-else-return': 'off',
      'no-console': 'off',
      'no-return-assign': 'off',
      'no-param-reassign': 'off',
      'no-promise-executor-return': 'off', // common to return setTimeout(), we know the value won't be accessible
      'no-restricted-syntax': ['off'],
      'no-unused-expressions': 'off',
      'no-loop-func': 'off',
      'no-inner-declarations': 'off',

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

      'no-unused-vars': [
        'error',
        {
          args: 'none',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
    settings: {
      jsdoc: {
        mode: 'typescript',
      },
    },
  },
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
];
