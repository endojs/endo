export default {
  // Keep ts-blank-space until Node 22 is the least supported Node version.
  nodeArguments: ['--import', 'ts-blank-space/register', '-C', 'ses-ava:endo'],
  environmentVariables: {
    LOCKDOWN_HARDEN_TAMING: 'unsafe',
  },
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
