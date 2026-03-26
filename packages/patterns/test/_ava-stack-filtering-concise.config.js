export default {
  // Keep ts-blank-space until Node 22 is the least supported Node version.
  nodeArguments: ['--import', 'ts-blank-space/register'],
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test-verbose.*'],
  environmentVariables: {
    LOCKDOWN_STACK_FILTERING: 'verbose',
  },
  timeout: '2m',
};
