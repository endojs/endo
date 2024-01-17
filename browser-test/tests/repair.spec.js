// @ts-check
const { test, expect } = require('@playwright/test');

test.skip('bundled-ses lockdown is consistent across browsers', async ({
  page,
  browser,
  browserName,
}) => {
  console.log(browserName, browser.version());
  await page.goto(`http://127.0.0.1:3000/`);
  const result = await page.evaluate(() => {
    Object.defineProperty(Object.prototype, 'toString', {
      value: function () {},
    });
    try {
      lockdown();
    } catch (e) {
      return e.message;
    }
    return 'Pass';
  });
  expect(result).toBe('Pass');
});
