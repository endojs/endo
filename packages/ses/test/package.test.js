import test from 'ava';
import url from 'url';
import { spawn } from 'child_process';

const cwd = url.fileURLToPath(new URL('package/', import.meta.url));

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
    await new Promise(resolve => {
      const child = spawn('node', args, { cwd, stdio });
      child.on('close', actualCode => {
        t.is(actualCode, code);
        resolve(true);
      });
    });
  });
}
