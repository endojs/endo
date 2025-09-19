import test from 'ava';
import url from 'url';
import { spawn } from 'child_process';

test('harden package condition uses existing global', async t => {
  await new Promise((resolve, reject) => {
    const child = spawn('node', [
      '-C',
      'harden',
      url.fileURLToPath(
        new URL('_harden-package-condition.js', import.meta.url),
      ),
    ]);
    child.on('close', actualCode => {
      try {
        t.is(actualCode, 0);
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
});

test('harden balks if package condition provided but implementation absent', async t => {
  await new Promise((resolve, reject) => {
    const child = spawn('node', ['-C', 'harden', '@endo/harden'], {
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    child.on('close', actualCode => {
      try {
        t.is(actualCode, 1);
        resolve(true);
      } catch (error) {
        reject(error);
      }
    });
  });
});
