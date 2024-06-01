#!/usr/bin/env node
/* global process */
import { spawn } from 'child_process';

const main = async () => {
  for (const fixture of process.argv.slice(2)) {
    console.error(`# ${fixture}`);
    const child = spawn('node', [fixture], {
      stdio: ['inherit', 'inherit', 'inherit'],
    });
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
