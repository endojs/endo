// @ts-check
/* global process */

// Establish a perimeter:
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
import { start, stop, purge, makeEndoClient } from '../index.js';

const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {Array<string>} root
 */
const makeConfig = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath: path.join(dirname, ...root, 'endo.sock'),
    pets: new Map(),
    values: new Map(),
  };
};

let configPathId = 0;

/**
 * @param {string} testTitle
 */
const getConfigDirectoryName = testTitle => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const basePath =
    defaultPath.length <= 22 ? defaultPath : defaultPath.slice(0, 22);
  const testId = String(configPathId).padStart(4, '0');
  configPathId += 1;
  return `${basePath}#${testId}`;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  const config = makeConfig('tmp', getConfigDirectoryName(t.title));
  await purge(config);
  await start(config);
  return { cancel, cancelled, config };
};

test('flake repro: cancel worker during large evaluation (loop)', async t => {
  const iterations = Number(process.env.ENDO_FLAKE_ITERATIONS || 500);
  const payloadBytes = Number(process.env.ENDO_FLAKE_PAYLOAD_BYTES || 256 * 1024);
  const jitterMs = Number(process.env.ENDO_FLAKE_JITTER_MS || 3);

  const { cancel, cancelled, config } = await prepareConfig(t);

  const { getBootstrap, closed } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const host = E(getBootstrap()).host();

  for (let i = 1; i <= iterations; i += 1) {
    // Use a constant name to exercise cancel/provide races on the same id.
    await E(host).provideWorker(['worker']);

    // Create a large result so the worker->daemon netstring framing gets stressed.
    const evalP = E(host).evaluate(
      'worker',
      `('x'.repeat(${payloadBytes}))`,
      [],
      [],
    );

    if (jitterMs > 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * jitterMs)),
      );
    }

    // Trigger termination while evaluation traffic is potentially in flight.
    const cancelP = E(host).cancel('worker');

    // eslint-disable-next-line no-await-in-loop
    await Promise.allSettled([evalP, cancelP]);
  }

  cancel(Error('done'));
  await closed.catch(() => {});
  await stop(config);
  t.pass();
});

