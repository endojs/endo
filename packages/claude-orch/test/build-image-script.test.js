// @ts-nocheck
/* global process */
/* eslint-disable import/order, no-underscore-dangle */

import '@endo/init';
import test from 'ava';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'build-image.sh');

test('build-image.sh parses as valid bash', async t => {
  const { stdout, stderr } = await execFileAsync('bash', ['-n', SCRIPT]);
  t.is(stdout, '');
  t.is(stderr, '');
});

test('postinst.sh parses as valid bash', async t => {
  const postinst = path.resolve(
    __dirname,
    '..',
    'images',
    'mkosi.conf.d',
    '10-claude',
    'postinst.sh',
  );
  await t.notThrowsAsync(execFileAsync('bash', ['-n', postinst]));
});

test('build-image.sh --check exits cleanly when prerequisites are present (or fails fast otherwise)', async t => {
  // We don't know whether cargo/mkosi/LINUX_SRC are present in CI, but
  // --check must EITHER succeed with code 0 ("ok") OR fail with code 1
  // and a useful message. It must not crash or hang.
  try {
    const { stdout } = await execFileAsync(
      'bash',
      [SCRIPT, '--check', 'x86_64'],
      { timeout: 5000, env: { ...process.env, LINUX_SRC: '/nonexistent' } },
    );
    t.regex(stdout, /All prerequisites satisfied/);
  } catch (e) {
    const err = /** @type {any} */ (e);
    t.is(err.code, 1);
    t.regex(err.stderr, /Missing/);
  }
});

test('build-image.sh --check rejects unknown architecture by failing prereq or arch logic', async t => {
  try {
    await execFileAsync('bash', [SCRIPT, '--check', 'mips32'], {
      timeout: 5000,
      env: { ...process.env, LINUX_SRC: '/nonexistent' },
    });
    t.fail('expected non-zero exit for unknown arch');
  } catch (e) {
    const err = /** @type {any} */ (e);
    t.true(err.code !== 0);
  }
});
