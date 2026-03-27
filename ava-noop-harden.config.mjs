export default {
  // Keep ts-blank-space until Node 22 is the least supported Node version.
  nodeArguments: ['--import', 'ts-blank-space/register', '-C', 'noop-harden'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
