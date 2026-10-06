// @ts-nocheck
import test from 'ava';
import url from 'url';
import { spawn } from 'child_process';

const cwd = url.fileURLToPath(new URL('./', import.meta.url));

const stdio = ['ignore', 'pipe', 'pipe'];

const runLockdown = shape =>
  new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['_lockdown-with-frozen-null-pills.js', shape],
      { cwd, stdio },
    );
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', chunk => stdoutChunks.push(chunk));
    child.stderr.on('data', chunk => stderrChunks.push(chunk));
    child.on('error', reject);
    child.on('close', code => {
      const decode = chunks => new TextDecoder().decode(Buffer.concat(chunks));
      resolve({
        code,
        stdout: decode(stdoutChunks),
        stderr: decode(stderrChunks),
      });
    });
  });

test('frozen null pills: lockdown succeeds and warns', async t => {
  const { code, stdout, stderr } = await runLockdown('frozen-null');
  t.is(code, 0, stderr);
  t.is(stdout, '');
  const lines = stderr.split('\n');
  for (const expectedLine of [
    '  Removing intrinsics.Array.isArray.arguments',
    '  Tolerating undeletable intrinsics.Array.isArray.arguments === null',
    '  Removing intrinsics.Array.isArray.caller',
    '  Tolerating undeletable intrinsics.Array.isArray.caller === null',
  ]) {
    t.true(lines.includes(expectedLine), `missing ${expectedLine}`);
  }
});

test('frozen non-null pill: lockdown still fails', async t => {
  const { code, stderr } = await runLockdown('frozen-zero');
  t.not(code, 0);
  t.regex(stderr, /failed to delete intrinsics\.Array\.isArray\.arguments/);
  t.notRegex(stderr, /Tolerating undeletable/);
});

test('writable null pill: lockdown still fails', async t => {
  const { code, stderr } = await runLockdown('writable-null');
  t.not(code, 0);
  t.regex(stderr, /failed to delete intrinsics\.Array\.isArray\.arguments/);
  t.notRegex(stderr, /Tolerating undeletable/);
});
