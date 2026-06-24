// Standalone browser regression test: monaco-editor under SES lockdown
// (overrideTaming: 'severe'). NOT an AVA test — behaviour only reproduces
// in a real browser with a real bundle, so it stands up its own Vite server
// (without the Endo daemon plugin) and drives headless Chromium via
// Playwright, mirroring @endo/preact-container's browser suite.
//
//   node test/monaco-lockdown/run.mjs   (or: yarn test:monaco-lockdown)
//
// Requires a Playwright Chromium: `yarn playwright install chromium`.
//
// This exercises RUNTIME interaction (typing, undo/redo, find, multi-cursor,
// selections), not just first load — monaco can fail to mutate frozen
// primordials only once a user starts editing.

import { fileURLToPath } from 'url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const root = fileURLToPath(new URL('.', import.meta.url));

// Monaco posts to a disabled worker (getWorker returns null); those errors
// are expected and unrelated to lockdown. A genuine lockdown failure looks
// like a frozen-realm mutation error.
const isExpectedWorkerNoise = text =>
  /postMessage|post message to worker|SES_UNHANDLED_REJECTION|SES_UNCAUGHT_EXCEPTION|^\s*$|TypeError#\d|Error#\d|Could not find source file|getWorker/.test(
    text,
  );
const isLockdownSmell = text =>
  /read only property|read-only|not extensible|Cannot add property|Cannot assign|Cannot redefine|Cannot define property|object is not extensible|frozen|Cannot delete property|override mistake|is not writable/i.test(
    text,
  );

const server = await createServer({
  root,
  configFile: false,
  logLevel: 'warn',
  server: { port: 5199, strictPort: true },
});
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage();

const consoleErrors = [];
page.on('console', m => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

let loadResult = { ok: true };
const fail = async msg => {
  await browser.close();
  await server.close();
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};

await page.goto('http://localhost:5199/');
try {
  await page.waitForFunction(() => globalThis.__ready === true, {
    timeout: 45000,
  });
} catch (e) {
  await fail(`probe never became ready: ${e.message}`);
}
loadResult = await page.evaluate(
  () => globalThis.__monacoResult || { ok: true },
);
if (!loadResult.ok) {
  await fail(
    `monaco threw on load under lockdown: ${loadResult.error}\n${loadResult.stack}`,
  );
}

// ---- RUNTIME INTERACTION PHASE ----
// Focus via the editor API (more robust than locating the hidden textarea
// in headless shell), then drive real keystrokes through the page.
await page.evaluate(() => globalThis.__editor.focus());
await page.waitForTimeout(150);

// 1. Type code that triggers auto-closing brackets/quotes + auto-indent.
await page.keyboard.type('function greet(name) {\n');
await page.keyboard.type("return 'hi ' + name;");
await page.waitForTimeout(50);

// 2. Selection + replacement.
await page.keyboard.press('Control+A');
await page.keyboard.type('const a = [1, 2, 3];');
await page.waitForTimeout(50);

// 3. Undo / redo stack.
for (let i = 0; i < 5; i += 1) await page.keyboard.press('Control+Z');
for (let i = 0; i < 3; i += 1) await page.keyboard.press('Control+Y');
await page.waitForTimeout(50);

// 4. Multi-cursor (Ctrl+D word select) + edit.
await page.keyboard.press('Control+A');
await page.keyboard.type('foo bar foo bar foo');
await page.keyboard.press('Home');
await page.keyboard.press('Control+D');
await page.keyboard.press('Control+D');
await page.keyboard.type('X');
await page.waitForTimeout(50);

// 5. Find widget.
await page.keyboard.press('Control+F');
await page.waitForTimeout(100);
await page.keyboard.type('foo');
await page.waitForTimeout(100);
await page.keyboard.press('Escape');

// 6. Programmatic edits / model API that touch internal data structures.
const programmatic = await page.evaluate(() => {
  try {
    const ed = globalThis.__editor;
    const monaco = globalThis.__monaco;
    const model = ed.getModel();
    ed.executeEdits('test', [
      { range: new monaco.Range(1, 1, 1, 1), text: '// header\n' },
    ]);
    model.applyEdits([
      { range: new monaco.Range(1, 1, 1, 1), text: '/* x */' },
    ]);
    model.pushEditOperations(
      [],
      [{ range: new monaco.Range(1, 1, 1, 1), text: 'z' }],
      () => null,
    );
    ed.setSelection(new monaco.Selection(1, 1, 2, 1));
    ed.trigger('test', 'editor.action.commentLine', null);
    ed.trigger('test', 'undo', null);
    ed.getValue();
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `${e.name}: ${e.message}`,
      stack: String(e.stack).slice(0, 500),
    };
  }
});

const inPageErrors = await page.evaluate(() => globalThis.__monacoErrors || []);
const finalValue = await page.evaluate(() => globalThis.__editor.getValue());

await browser.close();
await server.close();

// ---- ANALYSIS ----
const allErrors = [...consoleErrors, ...inPageErrors];
const lockdownErrors = allErrors.filter(isLockdownSmell);
const otherErrors = allErrors.filter(
  t => !isExpectedWorkerNoise(t) && !isLockdownSmell(t),
);

console.log('=== runtime interaction complete ===');
console.log(
  'final editor value (first 80 chars):',
  JSON.stringify(String(finalValue).slice(0, 80)),
);
console.log('programmatic edits:', JSON.stringify(programmatic));
console.log(
  `total errors: ${allErrors.length} | lockdown-smell: ${lockdownErrors.length} | other(non-worker): ${otherErrors.length}`,
);

if (lockdownErrors.length) {
  console.log('=== LOCKDOWN-RELATED ERRORS ===');
  for (const e of [...new Set(lockdownErrors)].slice(0, 25))
    console.log('  -', e);
}
if (otherErrors.length) {
  console.log('=== OTHER (non-worker) ERRORS ===');
  for (const e of [...new Set(otherErrors)].slice(0, 25)) console.log('  -', e);
}

if (!programmatic.ok) {
  console.error(
    `FAIL: programmatic edit threw under lockdown: ${programmatic.error}\n${programmatic.stack}`,
  );
  process.exit(1);
}
if (lockdownErrors.length) {
  console.error('FAIL: lockdown-related runtime errors detected (see above)');
  process.exit(1);
}
console.log(
  'PASS: monaco survives runtime interaction under lockdown({ overrideTaming: "severe" })',
);
process.exit(0);
