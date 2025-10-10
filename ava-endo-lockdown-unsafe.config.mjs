export default {
  nodeArguments: ['-C', 'ses-ava:endo'],
  environmentVariables: {
    LOCKDOWN_HARDEN_TAMING: 'unsafe',
  },
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
