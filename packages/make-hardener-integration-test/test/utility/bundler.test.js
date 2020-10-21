import puppeteer from "puppeteer";
import test from "tape-promise/tape";

import path from "path";

const runBrowserTests = async (t, indexFile) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  page.on("pageerror", err => {
    t.fail(err);
  });

  let numTests;
  let numPass;
  page.on("console", msg => {
    if (msg.text().includes("# tests")) {
      [numTests] = msg
        .text()
        .split(" ")
        .slice(-1);
    }
    if (msg.text().includes("# pass")) {
      [numPass] = msg
        .text()
        .split(" ")
        .slice(-1);
    }
  });
  try {
    await page.goto(`file://${path.join(__dirname, indexFile)}`);
    await page.title();
  } finally {
    await browser.close();
  }
  return { numTests, numPass };
};

const testBundler = (bundlerName, indexFile) => {
  test(`makeHardener works with ${bundlerName}`, t => {
    return runBrowserTests(t, indexFile).then(({ numTests, numPass }) => {
      t.notEqual(numTests, undefined);
      t.equal(numTests, numPass);
      t.end();
    });
  });
};

export default testBundler;
