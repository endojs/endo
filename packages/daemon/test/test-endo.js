// @ts-check
/* global process */

// Establish a perimeter:
import 'ses';
import '@endo/eventual-send/shim.js';
import '@endo/lockdown/commit-debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import {
  start,
  stop,
  restart,
  clean,
  reset,
  makeEndoClient,
} from '../index.js';

const { raw } = String;

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

const locator = {
  statePath: path.join(dirname, 'tmp/state'),
  cachePath: path.join(dirname, 'tmp/cache'),
  sockPath:
    process.platform === 'win32'
      ? raw`\\?\pipe\endo-test.sock`
      : path.join(dirname, 'tmp/endo.sock'),
};

test.serial('lifecycle', async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();

  await reset(locator);
  await clean(locator);
  await start(locator);
  await stop(locator);
  await restart(locator);

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  const worker = await E(bootstrap).makeWorker();
  await E(E.get(worker).actions).terminate();
  cancel(new Error('Cancelled'));
  await closed;

  await stop(locator);

  t.pass();
});
