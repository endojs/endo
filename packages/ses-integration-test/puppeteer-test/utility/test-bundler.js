/* global __dirname setTimeout */

import puppeteer from 'puppeteer';
import test from 'tape-promise/tape';

import path from 'path';

const runBrowserTests = async (t, indexFile) => {
  // When this test fails with SES_NO_SLOPPY, it may indicate that the bundler,
  // often just Parcel, inferred from access to a Node.js global object like
  // process, which it then shimmed. This alters the shape of the bundle such
  // that SES does not execute in strict mode.  The remediation is usually to
  // change the form "process" or "global.process" to "globalThis.process", or
  // similar.

  const browser = await puppeteer.launch({
    debug: { headless: false },
  });

  let numTests;
  let numPass;

  const page = await browser.newPage();

  const done = new Promise((resolve, reject) => {
    page.on('pageerror', e => {
      // Wait a little while before rejecting, to give the test time to
      // complete.
      setTimeout(() => reject(e), 3000);
    });

    page.on('console', msg => {
      console.log('>>> ', msg.text());
      if (msg.text().includes('# tests')) {
        [numTests] = msg.text().split(' ').slice(-1);
      }
      if (msg.text().includes('# pass')) {
        [numPass] = msg.text().split(' ').slice(-1);
      }
      if (msg.text().includes('# fail')) {
        reject(Error(`At least one test failed for ${indexFile}`));
      }
      if (msg.text().includes('# ok')) {
        resolve();
      }
    });
  });

  try {
    await Promise.race([
      done,
      page.goto(`file:${path.join(__dirname, indexFile)}`),
    ]);

    await done;
  } finally {
    await browser.close();
  }

  if (numTests === undefined) {
    t.fail('No test results reported');
  }

  return { numTests, numPass };
};

const testBundler = (bundlerName, indexFile) => {
  test(`SES works with ${bundlerName}`, t => {
    runBrowserTests(t, indexFile)
      .then(({ numTests, numPass }) => {
        t.notEqual(numTests, undefined);
        t.equal(numTests, numPass);
      })
      .catch(e => t.fail(`Unexpected exception ${e}`))
      .finally(() => t.end());
  });
};

export default testBundler;
