// Run tests with lockdown (traditional Endo environment)
export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
