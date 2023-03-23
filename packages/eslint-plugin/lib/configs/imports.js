module.exports = {
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
          '**/test-*.js',
          '**/demo*/**/*.js',
          '**/scripts/**/*.js',
        ],
      },
    ],

    'import/prefer-default-export': 'off',
  },
};
