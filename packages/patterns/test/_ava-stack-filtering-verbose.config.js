export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test-concise.*'],
  environmentVariables: {
    LOCKDOWN_STACK_FILTERING: 'concise',
  },
  timeout: '2m',
};
