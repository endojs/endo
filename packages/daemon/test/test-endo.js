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

/** @param {Array<string>} root */
const makeLocator = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

test('lifecycle', async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const locator = makeLocator('tmp', 'lifecycle');

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
  await E(worker).terminate();
  cancel(new Error('Cancelled'));
  await closed;

  await stop(locator);

  t.pass();
});

test('spawn and evaluate', async t => {
  const { promise: cancelled } = makePromiseKit();
  const locator = makeLocator('tmp', 'spawn-eval');

  await reset(locator);
  await start(locator);

  const { getBootstrap } = await makeEndoClient(
    'client',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();

  const worker = E(bootstrap).makeWorker();
  const ten = await E(worker).evaluate('10', [], []);
  t.is(10, ten);

  await stop(locator);
});

test('persist spawn and evaluation', async t => {
  const { promise: cancelled } = makePromiseKit();
  const locator = makeLocator('tmp', 'persist-spawn-eval');

  await reset(locator);
  await start(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );
    const bootstrap = getBootstrap();

    const worker = E(bootstrap).makeWorker();
    const ten = await E(worker).evaluate('10', [], [], 'ten');
    t.is(10, ten);
    const twenty = await E(worker).evaluate(
      'number * 2',
      ['number'],
      ['ten'],
      'twenty',
    );

    // TODO
    // Erase the pet name for 'ten', demonstrating that the evaluation record
    // does not retain its dependencies by their name.
    // await E(worker).forget('ten');

    t.is(20, twenty);
  }

  await restart(locator);

  {
    const { getBootstrap } = await makeEndoClient(
      'client',
      locator.sockPath,
      cancelled,
    );

    const bootstrap = getBootstrap();

    const retwenty = await E(bootstrap).provide('twenty');
    t.is(20, retwenty);
  }

  await stop(locator);
});
