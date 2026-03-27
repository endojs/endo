export default {
  // Keep ts-blank-space until Node 22 is the least supported Node version.
  nodeArguments: ['--import', 'ts-blank-space/register'],
  files: ['test/**/*.test.*'],
};
