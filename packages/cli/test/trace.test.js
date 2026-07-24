import assert from 'node:assert';
import os from 'os';
import path from 'path';
import test from 'ava';
import url from 'url';
import { $ } from 'execa';

const dirname = url.fileURLToPath(new URL('.', import.meta.url)).toString();

const testRoot = path.join(dirname, 'tmp', 'endo-trace');
const endoEnv = {
  XDG_STATE_HOME: path.join(testRoot, 'state'),
  XDG_RUNTIME_DIR: path.join(testRoot, 'run'),
  XDG_CACHE_HOME: path.join(testRoot, 'cache'),
  ENDO_SOCK: path.join(os.tmpdir(), `endo-trace-${process.pid}.sock`),
  ENDO_ADDR: '127.0.0.1:0',
};

for (const [key, value] of Object.entries(endoEnv)) {
  process.env[key] = value;
}

test.serial(
  'endo trace --stats reports an aggregator on a fresh daemon',
  async t => {
    const execa = $({ cwd: dirname });
    await execa`endo purge -f`;
    await execa`endo start`;
    try {
      const result = await execa`endo trace --stats --json`;
      const stats = JSON.parse(result.stdout);
      t.is(typeof stats.workers, 'number');
      t.is(typeof stats.totalRecords, 'number');
      t.is(typeof stats.bytes, 'number');
      t.is(typeof stats.aliases, 'number');
    } finally {
      await execa`endo purge -f`;
    }
  },
);

test.serial(
  'endo trace --recent shows a worker emission after a failing eval',
  async t => {
    const execa = $({ cwd: dirname });
    await execa`endo purge -f`;
    await execa`endo start`;
    try {
      // Trigger a failing eval; the CLI exits non-zero, which execa
      // surfaces as a thrown ExecaError.
      await t.throwsAsync(
        execa`endo eval ${'throw new Error("trace-cli-boom")'}`,
      );

      const result = await execa`endo trace --recent --limit 5 --json`;
      /** @type {Array<{ message: string, workerId: string }>} */
      const list = JSON.parse(result.stdout);
      t.true(Array.isArray(list));
      t.true(Array.isArray(list) && list.length >= 1);
      const found = list.find(r => /trace-cli-boom/.test(r.message));
      assert(
        found,
        `expected a record matching 'trace-cli-boom' in ${result.stdout}`,
      );
      // The aggregate stamps the worker's authoritative id; a worker
      // emission must not be filed under @daemon.
      t.true(found.workerId !== '@daemon');
    } finally {
      await execa`endo purge -f`;
    }
  },
);

test.serial(
  'endo trace <unknownId> exits non-zero with a friendly message',
  async t => {
    const execa = $({ cwd: dirname });
    await execa`endo purge -f`;
    await execa`endo start`;
    try {
      const error = /** @type {Error & { stderr: string }} */ (
        await t.throwsAsync(execa`endo trace ${'error:does-not-exist#1'}`)
      );
      t.regex(error.stderr, /No trace recorded for/);
    } finally {
      await execa`endo purge -f`;
    }
  },
);
