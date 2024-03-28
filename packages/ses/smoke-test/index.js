/* eslint-disable @endo/no-polymorphic-call */
/* global process */

/* eslint-disable import/no-unresolved */ // puppeteer-core is not getting installed by default, so linter complains
import puppeteer from 'puppeteer-core';
import assert from 'assert';

const chromePath = process.argv[2];
console.log(`chromePath ${chromePath}`);

let browser;

async function runTests() {
  // Launch the browser
  browser = await puppeteer.launch({
    headless: 'new',
    executablePath: chromePath,
    protocolTimeout: 30000,
  });

  // Open a new page
  const page = await browser.newPage();
  page.on('pageerror', async err => {
    console.error(`Page error: ${err.toString()}`);
  });

  const pathToIndex = new URL('./fixture/index.html', import.meta.url).href;
  console.log(`opening ${pathToIndex}`);

  await page.goto(pathToIndex, { waitUntil: 'domcontentloaded' });
  // await page.goto(pathToIndex);
  // await page.goto(pathToIndex, { waitUntil: 'load' });

  assert.equal(
    await page.evaluate(`typeof lockdown;`),
    'function',
    'lockdown is not a function. did you build and include SES?',
  );
  const result = await page.evaluate(`
  try {
    lockdown();
    'success';
  }
  catch (e) {
    e.toString();
  }
  `);
  assert.equal(result, 'success', 'lockdown failed');

  await browser.close();
}

runTests().catch(error => {
  console.error(error);
  browser && browser.close();
  process.exit(1);
});
