// Standalone browser test for the inventory drag-and-drop factories
// (inventory-dnd.js). Like test/monaco-lockdown, it stands up its own Vite
// server (no Endo daemon) and drives headless Chromium via Playwright, because
// native HTML5 drag-and-drop only behaves in a real browser.
//
//   node test/inventory-dnd/run.mjs   (or: yarn test:inventory-dnd)
//
// Requires a Playwright Chromium: `yarn playwright install chromium`.

import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('.', import.meta.url));

const server = await createServer({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  configFile: false,
  logLevel: 'warn',
  server: { port: 5200, strictPort: true },
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

await page.goto('http://localhost:5200/test/inventory-dnd/index.html');
let results;
try {
  await page.waitForFunction(() => globalThis.__dndDone === true, {
    timeout: 45000,
  });
  results = await page.evaluate(() => globalThis.__dndResults);
} catch (e) {
  await fail(
    `probe never completed: ${e.message}\npage errors:\n${pageErrors.join('\n')}`,
  );
}

await browser.close();
await server.close();

let failed = 0;
for (const r of results) {
  const tag = r.pass ? 'ok  ' : 'FAIL';
  if (!r.pass) failed += 1;
  console.log(`${tag} ${r.name}${r.pass ? '' : `  -> ${r.detail}`}`);
}
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed > 0) {
  console.error('FAIL: drag-and-drop behavior regressed');
  process.exit(1);
}
console.log('PASS: inventory drag-and-drop factories behave correctly');
process.exit(0);
