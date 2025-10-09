export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  environmentVariables: {
    LOCKDOWN_HARDEN_TAMING: 'unsafe',
  },
  timeout: '2m',
};
