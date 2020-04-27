import tap from 'tap';
import { spawn } from 'child_process';
import { dirname, join } from 'path';

const { test } = tap;

const cwd = join(dirname(new URL(import.meta.url).pathname), 'package');

const table = {
  // The following tests are disabled since we have dropped
  // support for CommonJS and -r ESM usage.
  // This code is retained in case this situation proves to be temporary.
  // cjs: {
  //   args: ['test.cjs'],
  //   code: 0,
  // },
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
  test(name, t => {
    t.plan(1);
    const child = spawn('node', args, { cwd, stdio });
    child.on('close', actualCode => {
      t.equals(actualCode, code);
    });
  });
}
