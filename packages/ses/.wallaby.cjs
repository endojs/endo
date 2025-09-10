module.exports = {
  autoDetect: ['node:test'],
  env: {
    params: {
      env: 'WALLABY=1',
    },
    runner: 'node',
    type: 'node',
  },
  files: ['package.json', 'src/**/*.js', '*.js', 'test/_*.js'],
  runMode: 'onsave',
  tests: ['test/import-gauntlet.test.js'],
  debug: true,
};
