// @ts-check
const path = require('path');
const http = require('http');
const handler = require('serve-handler');
const { test, expect } = require('@playwright/test');

const config = {
  public: path.resolve(__dirname, '..', '..'),
};

const server = http.createServer((request, response) => handler(request, response, config));
const listening = new Promise((resolve, reject) => {
  server.listen(0, '127.0.0.1', error => {
    if (error) {
      reject(error);
    } else {
      resolve(server.address());
    }
  });
});

test('bundled-ses lockdown runs to completion', async ({ page }) => {
  const { address, port } = await listening;

  await page.goto(`http://${address}:${port}/browser-test/assets/endo-bundled-ses`);

  // Expect a title "to contain" a substring.
  await expect(page).toHaveTitle(/Pass/);
});
