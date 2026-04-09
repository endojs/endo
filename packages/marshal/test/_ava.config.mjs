// Keep ts-blank-space until Node 22 is the least supported Node version.
export default {
  require: ['@endo/ses-ava/prepare-endo-config.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
  nodeArguments: ['--import', 'ts-blank-space/register'],
};
