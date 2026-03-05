import test from 'ava';
import url from 'url';
import { spawn } from 'child_process';
import fs from 'fs';

const cwd = url.fileURLToPath(new URL('_package/', import.meta.url));
const packageRoot = url.fileURLToPath(new URL('..', import.meta.url));
const distCjs = url.fileURLToPath(new URL('../dist/ses.cjs', import.meta.url));
const bundleScript = url.fileURLToPath(
  new URL('../scripts/bundle.js', import.meta.url),
);

test.before(async () => {
  if (fs.existsSync(distCjs)) {
    return;
  }
  await new Promise((resolve, reject) => {
    const child = spawn('node', [bundleScript], {
      cwd: packageRoot,
      stdio: 'inherit',
    });
    child.on('close', code => {
      if (code === 0) {
        resolve(undefined);
      } else {
        reject(new Error(`SES build failed with exit code ${code}`));
      }
    });
  });
});

const table = {
  cjs: {
    args: ['test.cjs'],
    code: 0,
  },
  // SES can no longer support node -r esm because it entrains the Node.js
  // domain module.
  // resm: {
  //   args: ['-r', 'esm', 'test.js'],
  //   code: 0,
  // },
  esm: {
    args: ['test.mjs'],
    code: 0,
  },
  'who tests the tests': {
    args: ['-e', 'throw "barff"'],
    code: 1,
  },
};

const stdio = ['ignore', 'ignore', 'ignore'];

for (const [name, { args, code }] of Object.entries(table)) {
  test(name, async t => {
    await new Promise((resolve, reject) => {
      // @ts-expect-error
      const child = spawn('node', args, { cwd, stdio });
      // @ts-expect-error
      child.on('close', actualCode => {
        try {
          t.is(actualCode, code);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      });
    });
  });
}
