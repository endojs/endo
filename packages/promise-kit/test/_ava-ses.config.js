// Run tests with lockdown (traditional Endo environment)
export default {
  require: ['ses', 'test/_lockdown.js'],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
