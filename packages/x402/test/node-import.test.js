// @ts-check

import { execFile } from 'node:child_process';
import { execPath } from 'node:process';
import { promisify } from 'node:util';

import test from 'ava';

const execFileAsync = promisify(execFile);

test('package entrypoint imports without a global harden', async t => {
  const entrypoint = new URL('../index.js', import.meta.url);
  const source = `
    if ('harden' in globalThis) {
      throw new Error('test requires an ordinary Node realm');
    }
    const namespace = await import(${JSON.stringify(entrypoint.href)});
    if (typeof namespace.makeX402Client !== 'function') {
      throw new Error('x402 entrypoint did not export makeX402Client');
    }
  `;

  await t.notThrowsAsync(
    execFileAsync(execPath, ['--input-type=module', '-e', source]),
  );
});
