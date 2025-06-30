// @ts-check
const { test, expect } = require('@playwright/test');

// The server is started by the test runner in playright.config.js
// The server is serving CSP preventing evaluators from running if requested on /csp
// The results of the test run are produced by the code in ../inpage.js
// which is loaded by the server in server.js
// We cannot use page.evaluate because it causes playwright to 
// tamper with CSP enforcement regardless of bypassCSP setting.

test('bundled-ses lockdown runs to completion and Compartment evaluates', async ({
  page,
  browser,
  browserName,
}) => {
  const { statuses, errors } = await exerciseSesOnPage({
    page,
    browser,
    browserName,
    url: `http://127.0.0.1:3000/`,
  });

  expect(errors.length).toBe(0);
  expect(statuses).toContain('[pass]: lockdown');
  expect(statuses).toContain('[pass]: compartment');
});

test('bundled-ses lockdown runs to completion under CSP when evaluation is banned', async ({
  page,
  browser,
  browserName,
}) => {
  const { statuses, errors } = await exerciseSesOnPage({
    page,
    browser,
    browserName,
    url: `http://127.0.0.1:3000/csp`,
  });

  expect(errors.length).toBeGreaterThan(0);
  expect(statuses).toContain('[pass]: lockdown');
  expect(statuses).not.toContain('[pass]: compartment');
  expect(errors[0]).toContain('EvalError');
});

async function exerciseSesOnPage({ browserName, browser, page, url }) {
  const statuses = [];
  const errors = [];
  const warnings = [];

  const browserId = browserName + browser.version();

  page.on('console', msg => {
    const text = msg.text();

    if (text.includes('[pass]')) {
      statuses.push(text);
    }
    if (text.includes('EvalError')) {
      errors.push(text);
    }
    if (text.includes('Removing intrinsics')) {
      warnings.push(text.replace(/Removing /, ''));
    }
    console.log(`[${browserId}]> Log in page: '${text}'`);
  });
  page.on('pageerror', error => {
    console.error(
      `[${browserId}]> Error in page: ${error.message}\n${error.stack}`,
    );
    errors.push(error.message);
  });

  await page.goto(url);
  console.warn(
    `
  ⚠️  Unexpected intrinsics in ${browserId}:`,
    warnings,
  );

  return { statuses, errors, warnings };
}
