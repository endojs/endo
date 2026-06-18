import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

// Vitest 4 transforms JSX with oxc. The ported tests use the classic
// runtime with the `createElement` pragma (they import `createElement`
// from preact directly).
export default defineConfig({
  resolve: {
    dedupe: ['preact'],
  },
  oxc: {
    jsx: {
      runtime: 'classic',
      pragma: 'createElement',
      pragmaFrag: 'Fragment',
    },
  },
  test: {
    globals: true,
    include: ['test/**/*.test.jsx'],
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
});
