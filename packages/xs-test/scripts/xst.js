#!/usr/bin/env node
/* global process */
import 'ses';
import fs from 'fs';
import { spawn } from 'child_process';
import { resolve } from 'path';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { fileURLToPath, pathToFileURL } from 'url';

const read = async location => fs.promises.readFile(fileURLToPath(location));

const main = async () => {
  for (const fixture of process.argv.slice(2)) {
    console.error(`# ${fixture}`);
    const script = await makeBundle(read, pathToFileURL(resolve(fixture)), {
      tags: new Set(['xs']),
    });
    const child = spawn('xst', ['/dev/stdin'], {
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    child.stdin.end(script);
    const { code, signal } = await new Promise(resolve => {
      child.on('exit', (code, signal) => {
        resolve({ code, signal });
      });
    });
    if (code === 0) {
      console.error('ok');
    } else {
      console.error(`not ok - exited code=${code} signal=${signal}`);
    }
  }
};

main().catch(err => {
  console.error('Error running main:', err);
  process.exitCode = 1;
});
