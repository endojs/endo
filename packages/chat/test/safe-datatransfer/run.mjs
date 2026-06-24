import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server = await createServer({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  configFile: false,
  logLevel: 'warn',
  server: { port: 5202, strictPort: true },
});
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
page.on('console', m => m.type() === 'error' && pageErrors.push(m.text()));
await page.goto('http://localhost:5202/test/safe-datatransfer/index.html');
let results;
try {
  await page.waitForFunction(() => globalThis.__done === true, {
    timeout: 45000,
  });
  results = await page.evaluate(() => globalThis.__results);
} catch (e) {
  await browser.close();
  await server.close();
  console.error(
    `FAIL: probe never completed: ${e.message}\n${pageErrors.join('\n')}`,
  );
  process.exit(1);
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
process.exit(failed > 0 ? 1 : 0);
