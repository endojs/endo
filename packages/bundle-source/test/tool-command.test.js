/* global Buffer, process */
import test from '@endo/ses-ava/prepare-endo.js';

import { spawn } from 'child_process';
import url from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';

const cwd = url.fileURLToPath(new URL('..', import.meta.url));
const cacheHome = fs.mkdtempSync(path.join(os.tmpdir(), 'endo-cache-'));
const env = { ...process.env, XDG_CACHE_HOME: cacheHome };

const shellOut = () =>
  new Promise((resolve, reject) => {
    const errorChunks = [];
    const child = spawn(
      'node',
      [
        'bin/bundle-source',
        '--cache-json',
        'bundles',
        'demo/circular/a.js',
        'circular',
        'demo/dir1/index.js',
        'dir1',
      ],
      {
        cwd,
        env,
        stdio: ['inherit', 'inherit', 'pipe'],
      },
    );
    child.on('close', code => {
      if (code !== 0) {
        reject(
          new Error(
            `Exit code: ${code}\nError output: ${new TextDecoder().decode(
              Buffer.concat(errorChunks),
            )}`,
          ),
        );
      } else {
        resolve(undefined);
      }
    });
    child.stderr.on('data', chunk => {
      errorChunks.push(chunk);
    });
  });

const shellOutInvalidFormat = () =>
  new Promise((resolve, reject) => {
    const errorChunks = [];
    const child = spawn(
      'node',
      ['bin/bundle-source', '--format', 'unsupported', 'demo/meaning.js'],
      {
        cwd,
        env,
        stdio: ['inherit', 'inherit', 'pipe'],
      },
    );
    child.on('close', code => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(
          new Error(
            `Exit code: ${code}\nError output: ${new TextDecoder().decode(
              Buffer.concat(errorChunks),
            )}`,
          ),
        );
      }
    });
    child.stderr.on('data', chunk => {
      errorChunks.push(chunk);
    });
  });

test('bundle-source command is concurrency safe', async t => {
  const concurrentJobs = Array.from({ length: 5 }).map(() => shellOut());
  await Promise.all(concurrentJobs);
  t.pass();
});

test('bundle-source usage includes endoScript format', async t => {
  await t.throwsAsync(() => shellOutInvalidFormat(), {
    message: /-f,--format .*endoScript/,
  });
});
