/* global process */

import os from 'os';
import path from 'path';
import test from 'ava';
import url from 'url';
import { $ } from 'execa';

const dirname = url.fileURLToPath(new URL('.', import.meta.url)).toString();

// Use an isolated daemon context with a unique socket so this test file
// does not conflict with demo/index.test.js when AVA runs both
// concurrently in worker threads sharing the same process.pid.
const testRoot = path.join(dirname, 'tmp', 'endo-collection');
const endoEnv = {
  XDG_STATE_HOME: path.join(testRoot, 'state'),
  XDG_RUNTIME_DIR: path.join(testRoot, 'run'),
  XDG_CACHE_HOME: path.join(testRoot, 'cache'),
  ENDO_SOCK: path.join(os.tmpdir(), `endo-collection-${process.pid}.sock`),
};

for (const [key, value] of Object.entries(endoEnv)) {
  process.env[key] = value;
}

test.serial('terminates worker retaining collected value (cli)', async t => {
  const execa = $({ cwd: dirname });
  await execa`endo purge -f`;
  await execa`endo start`;
  try {
    await execa`endo spawn worker`;
    // Retain a host (daemon-side value) on the worker via CapTP export.
    // A daemon-side value is needed because worker-side values sent back
    // to the same worker are recognized as round-trips by CapTP and do
    // not trigger the export hook that registers retainees.
    await execa`endo eval --worker worker ${`E(host).provideHost('retained-host').then(retained => { globalThis.retained = retained; return 'ok'; })`} host:AGENT`;
    await execa`endo remove retained-host`;
    // The eval fails because the worker was terminated, but the CLI
    // does not set a non-zero exit code on command errors, so check
    // stderr for the collection error message instead.
    const result = await execa`endo eval --worker worker ${'1'}`;
    t.regex(
      result.stderr,
      /became unreachable by any pet name path and was collected/,
    );
  } finally {
    await execa`endo purge -f`;
  }
});
