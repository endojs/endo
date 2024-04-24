// @ts-check
const { test, expect } = require('@playwright/test');

test('bundled-ses lockdown runs to completion', async ({
  page,
  browser,
  browserName,
}) => {
  console.log(browserName, browser.version());

  page.on('console', msg => console.log('> Log in page:', msg.text()));
  page.on('pageerror', error => {
    console.error(`> Error in page: ${error.message}\n${error.stack}`);
  });

  await page.goto(`http://127.0.0.1:3000/`);
  const result = await page.evaluate(() => {
    "use strict";
    lockdown();
    return 'Pass';
  });
  expect(result).toBe('Pass');
});
