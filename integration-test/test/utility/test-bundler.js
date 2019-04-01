/* eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies */
import puppeteer from 'puppeteer';
/* eslint-disable-next-line import/no-unresolved, import/no-extraneous-dependencies */
import test from 'tape-promise/tape';

import path from 'path';

const runBrowserTests = async indexFile => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on('pageerror', err => {
    console.log(err);
  });

  let numTests;
  let numPass;
  page.on('console', msg => {
    if (msg.text().includes('# tests')) {
      [numTests] = msg
        .text()
        .split(' ')
        .slice(-1);
    }
    if (msg.text().includes('# pass')) {
      [numPass] = msg
        .text()
        .split(' ')
        .slice(-1);
    }
  });
  await page.goto(`file:${path.join(__dirname, indexFile)}`);
  await page.title();
  await browser.close();
  return { numTests, numPass };
};

const testBundler = (bundlerName, indexFile) => {
  test(`SES works with ${bundlerName}`, t => {
    runBrowserTests(indexFile).then(({ numTests, numPass }) => {
      t.notEqual(numTests, undefined);
      t.equal(numTests, numPass);
      t.end();
    });
  });
};

export default testBundler;
