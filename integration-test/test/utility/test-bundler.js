/* eslint-disable-next-line import/no-unresolved */
import puppeteer from 'puppeteer-core';
/* eslint-disable-next-line import/no-unresolved */
import test from 'tape-promise/tape';

import path from 'path';

const runBrowserTests = async indexFile => {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: 'google-chrome',
  });
  const page = await browser.newPage();
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
  test(`Nat works with ${bundlerName}`, t => {
    runBrowserTests(indexFile).then(({ numTests, numPass }) => {
      t.equal(numTests, '14');
      t.equal(numTests, numPass);
      t.end();
    });
  });
};

export default testBundler;
