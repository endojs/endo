export default {
  nodeArguments: ['-C', 'ses-ava:endo'],
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
