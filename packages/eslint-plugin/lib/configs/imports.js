module.exports = {
  settings: {
    'import/resolver': {
      exports: {},
      node: {},
    },
  },
  rules: {
    'import/extensions': ['error', 'always', { ignorePackages: true }],
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.config.js',
          '**/*.config.*.js',
          // leading wildcard to work in CLI (package path) and IDE (repo path)
          '**/test/**',
          // `.test-d.ts` files run under `tsd`; they are test-time
          // artifacts even when colocated with `src/`.
          '**/*.test-d.ts',
          '**/demo*/**/*.{js,mjs,cjs}',
          '**/scripts/**/*.{js,mjs,cjs}',
        ],
      },
    ],

    'import/prefer-default-export': 'off',
  },
};
