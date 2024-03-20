import test from '@endo/ses-ava/prepare-endo.js';

import { spawn } from 'child_process';
import url from 'url';
import Buffer from 'buffer';

const cwd = url.fileURLToPath(new URL('..', import.meta.url));

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

test('bundle-source command is concurrency safe', async t => {
  const concurrentJobs = Array.from({ length: 5 }).map(() => shellOut());
  await Promise.all(concurrentJobs);
  t.pass();
});
