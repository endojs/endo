/* global Buffer */
import test from '@endo/ses-ava/prepare-endo.js';

import { spawn } from 'child_process';
import url from 'url';

const textDecoder = new TextDecoder();

const cwd = url.fileURLToPath(new URL('..', import.meta.url));

const bundleSource = async (...args) => {
  const bundleBytes = await new Promise((resolve, reject) => {
    const errorChunks = [];
    const outputChunks = [];
    const child = spawn('node', ['bin/bundle-source', ...args], {
      cwd,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
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
        resolve(Buffer.concat(outputChunks));
      }
    });
    child.stdout.on('data', chunk => {
      outputChunks.push(chunk);
    });
    child.stderr.on('data', chunk => {
      errorChunks.push(chunk);
    });
  });
  const bundleText = textDecoder.decode(bundleBytes);
  return JSON.parse(bundleText);
};

test('bundle-source with --format and --tag', async t => {
  const compartment = new Compartment();
  {
    const bundle = await bundleSource(
      '--tag',
      'b',
      '--format',
      'endoScript',
      'demo/node_modules/conditional-reexports/entry.js',
    );
    const namespace = compartment.evaluate(bundle.source);
    t.is(namespace.default, 'b');
  }
  {
    const bundle = await bundleSource(
      '--tag',
      'a',
      '--format',
      'endoScript',
      'demo/node_modules/conditional-reexports/entry.js',
    );
    const namespace = compartment.evaluate(bundle.source);
    t.is(namespace.default, 'a');
  }
});
