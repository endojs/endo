// Run tests without lockdown (verify standalone functionality)
// @endo/promise-kit uses assert global, so we need 'ses' but not lockdown
export default {
  require: [
    // Initialize SES without lockdown to provide assert global
    'ses',
  ],
  files: ['test/**/*.test.*'],
  timeout: '2m',
};
