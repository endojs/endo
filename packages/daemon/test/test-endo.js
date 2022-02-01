// @ts-check
/* global process */

// Establish a perimeter:
import '@agoric/babel-standalone';
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit-debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { start, stop, restart, clean, makeEndoClient } from '../index.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

const locator = {
  statePath: path.join(dirname, 'tmp'),
  cachePath: path.join(dirname, 'tmp'),
  sockPath:
    process.platform === 'win32'
      ? raw`\\?\pipe\endo-test.sock`
      : path.join(dirname, 'tmp/endo.sock'),
};

test.serial('lifecycle', async t => {
  await clean(locator);
  await start(locator);
  await stop(locator);
  await restart(locator);

  const { getBootstrap, finalize, drained } = await makeEndoClient(
    'client',
    locator.sockPath,
  );
  const bootstrap = getBootstrap();
  const worker = await E(E.get(bootstrap).privateFacet).makeWorker();
  await E(E.get(worker).actions).terminate();
  finalize();
  await drained;

  await stop(locator);
  t.pass();
});
