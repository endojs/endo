import test from 'ava';
import { spawn } from 'child_process';
import { dirname, join } from 'path';

const cwd = join(dirname(new URL(import.meta.url).pathname), 'package');

const table = {
  cjs: {
    args: ['test.cjs'],
    code: 0,
  },
  resm: {
    args: ['-r', 'esm', 'test.js'],
    code: 0,
  },
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
  test.cb(name, t => {
    t.plan(1);
    const child = spawn('node', args, { cwd, stdio });
    child.on('close', actualCode => {
      t.is(actualCode, code);
      t.end();
    });
  });
}
