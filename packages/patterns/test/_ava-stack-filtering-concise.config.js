export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test-verbose.*'],
  environmentVariables: {
    LOCKDOWN_STACK_FILTERING: 'verbose',
  },
  timeout: '2m',
};
