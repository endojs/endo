export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  // The ses 0.18.3 test requires a separate configuration because it uses a
  // different base version of ses.
  files: ['test/**/*.test.*', '!test/ses0_18_3.test.js'],
  timeout: '2m',
};
