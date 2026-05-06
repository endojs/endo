// @ts-check
const { test, expect } = require('@playwright/test');

// The Chat entry at packages/chat/main.js attempts a one-shot
// redirect to `/dev` when no gateway/agent fragment is present and
// sessionStorage does not already carry the `endo-dev-attempted`
// flag.  Pre-seeding that flag steers the bundle into its
// deterministic "Gateway not configured" branch on the first
// navigation, with no /dev request and no WebSocket attempt.
const SEED_NO_DEV_REDIRECT = `
  try {
    sessionStorage.setItem('endo-dev-attempted', '1');
  } catch (err) {
    // sessionStorage is unavailable on the about:blank that
    // precedes the first navigation in some browsers; the script
    // re-runs on each navigation so the next pass will succeed.
  }
`;

test('chat bundle builds and loads', async ({ page }) => {
  /** @type {string[]} */
  const pageErrors = [];
  /** @type {{ url: string, failure: string | null }[]} */
  const failedRequests = [];

  page.on('pageerror', err => {
    pageErrors.push(err.stack || err.message);
  });
  page.on('requestfailed', req => {
    failedRequests.push({
      url: req.url(),
      failure: req.failure()?.errorText ?? null,
    });
  });

  await page.addInitScript(SEED_NO_DEV_REDIRECT);

  await page.goto('http://127.0.0.1:3000/chat/');

  // Reaching the "Gateway not configured" heading proves SES
  // lockdown succeeded, the bundle parsed, and the entry script
  // ran past its top-level imports
  // (ses, @endo/eventual-send/shim.js, connection.js, chat.js
  // and their transitive dependencies).
  await expect(
    page.getByRole('heading', { name: /Gateway not configured/i }),
  ).toBeVisible({ timeout: 30_000 });

  // The "Gateway not configured" branch in main.js intentionally
  // throws after rendering the heading so the rest of the entry
  // script does not run.  That throw is the only acceptable
  // page-level error from this run; any other pageerror indicates
  // a real bundle regression.
  const unexpectedPageErrors = pageErrors.filter(
    msg => !/Gateway not configured/.test(msg),
  );
  expect(unexpectedPageErrors, 'no unexpected page errors').toEqual([]);

  expect(failedRequests, 'no failed network requests').toEqual([]);
});
