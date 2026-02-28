// @ts-nocheck
/* global Buffer */
import test from 'ava';
import url from 'url';
import { spawn } from 'child_process';

const cwd = url.fileURLToPath(new URL('./', import.meta.url));

const stdio = ['ignore', 'pipe', 'pipe'];

test('node reporting to stderr with indented group', async t => {
  const child = spawn('node', ['_lockdown-with-extra-intrinsics.js'], {
    cwd,
    stdio,
  });
  const stdoutChunks = [];
  const stderrChunks = [];
  child.stdout.on('data', chunk => {
    stdoutChunks.push(chunk);
  });
  child.stderr.on('data', chunk => {
    stderrChunks.push(chunk);
  });
  await new Promise((resolve, reject) => {
    child.on('close', actualCode => {
      try {
        t.is(actualCode, 0);
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });

  // Nothing written to stdout
  t.deepEqual(Buffer.concat(stdoutChunks), Buffer.alloc(0));

  const stderrBytes = Buffer.concat(stderrChunks);
  const stderrText = new TextDecoder().decode(stderrBytes);
  const stderrLines = stderrText.trim().split('\n');

  // Group label for removing unpermitted intrinsics
  t.is(stderrLines.shift(), 'SES Removing unpermitted intrinsics');
  // And all remaining lines have exactly a two space indent
  t.assert(stderrLines.every(line => /^\s{2}\w/.test(line)));

  const expectedLines = [
    '  Removing intrinsics.Array.isArray.prototype',
    '  Tolerating undeletable intrinsics.Array.isArray.prototype === undefined',
    '  Removing intrinsics.Array.extraRemovableDataProperty',
    '  Removing intrinsics.Array.anotherOne',
  ];

  for (const expectedLine of expectedLines) {
    t.assert(stderrLines.some(line => line === expectedLine));
  }
});
