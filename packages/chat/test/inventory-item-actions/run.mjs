// Standalone browser test for the ItemActions Preact component. Like
// test/inventory-dnd, it stands up its own Vite server (no Endo daemon) and
// drives headless Chromium via Playwright.
//
//   node test/inventory-item-actions/run.mjs   (or: yarn test:item-actions)
//
// Requires a Playwright Chromium: `yarn playwright install chromium`.

import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server = await createServer({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  configFile: false,
  logLevel: 'warn',
  server: { port: 5201, strictPort: true },
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => {
  if (m.type() === 'error') pageErrors.push(m.text());
});

const fail = async msg => {
  await browser.close();
  await server.close();
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

await page.goto('http://localhost:5201/test/inventory-item-actions/index.html');
let results;
try {
  await page.waitForFunction(() => globalThis.__done === true, {
    timeout: 45000,
  });
  results = await page.evaluate(() => globalThis.__results);
} catch (e) {
  await fail(
    `probe never completed: ${e.message}\npage errors:\n${pageErrors.join('\n')}`,
  );
}

await browser.close();
await server.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(
    `${r.pass ? 'ok  ' : 'FAIL'} ${r.name}${r.pass ? '' : `  -> ${r.detail}`}`,
  );
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed > 0) {
  console.error('FAIL: ItemActions behavior regressed');
  process.exit(1);
}
console.log('PASS: ItemActions renders and behaves correctly under lockdown');
process.exit(0);
