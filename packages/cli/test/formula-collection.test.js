import test from 'ava';
import url from 'url';
import path from 'path';
import { $ } from 'execa';
import { daemonContext } from './_daemon-context.js';

const dirname = url.fileURLToPath(new URL('.', import.meta.url)).toString();

test.serial('terminates worker retaining collected value (cli)', async t => {
  const execa = $({ cwd: dirname });
  await daemonContext.setup(execa);
  try {
    const counterPath = path.join(dirname, 'demo', 'counter.js');
    await execa`endo spawn worker`;
    await execa`endo make ${counterPath} --name counter --worker worker`;
    await execa`endo eval --worker worker ${"globalThis.retained = counter; 'ok'"} counter`;
    await execa`endo remove counter`;
    await t.throwsAsync(execa`endo eval --worker worker ${'1'}`);
  } finally {
    await daemonContext.teardown(execa);
  }
});
