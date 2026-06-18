import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// The tests are plain JS using preact's `h` helper directly (no JSX),
// so no JSX transform is configured.
export default defineConfig({
  resolve: {
    dedupe: ['preact'],
  },
  test: {
    globals: true,
    include: ['test/**/*.test.js'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
});
