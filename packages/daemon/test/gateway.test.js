// @ts-check
/* global process */

// Establish a perimeter:
// eslint-disable-next-line import/order
import '@endo/init/debug.js';

import test from 'ava';
import url from 'url';
import path from 'path';
import fs from 'fs';

import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { start, stop, purge, makeEndoClient } from '../index.js';

const { raw } = String;
const dirname = url.fileURLToPath(new URL('..', import.meta.url)).toString();

/**
 * @param {string[]} root
 */
const makeConfig = (...root) => {
  return {
    statePath: path.join(dirname, ...root, 'state'),
    ephemeralStatePath: path.join(dirname, ...root, 'run'),
    cachePath: path.join(dirname, ...root, 'cache'),
    sockPath:
      process.platform === 'win32'
        ? raw`\\?\pipe\endo-${root.join('-')}-test.sock`
        : path.join(dirname, ...root, 'endo.sock'),
    address: '127.0.0.1:0',
    pets: new Map(),
    values: new Map(),
  };
};

let configPathId = 0;
const MAX_UNIX_SOCKET_PATH = 90;
const SOCKET_PATH_OVERHEAD =
  path.join(dirname, 'tmp').length + 1 + 'endo.sock'.length + 8;
const MAX_CONFIG_DIR_LENGTH = Math.max(
  8,
  MAX_UNIX_SOCKET_PATH - SOCKET_PATH_OVERHEAD,
);

/**
 * @param {string} testTitle
 * @param {number} configNumber
 */
const getConfigDirectoryName = (testTitle, configNumber) => {
  const defaultPath = testTitle.replace(/\s/giu, '-').replace(/[^\w-]/giu, '');
  const basePath =
    defaultPath.length <= MAX_CONFIG_DIR_LENGTH
      ? defaultPath
      : defaultPath.slice(0, MAX_CONFIG_DIR_LENGTH);
  const testId = String(configPathId).padStart(4, '0');
  const configId = String(configNumber).padStart(2, '0');
  const configSubDirectory = `${basePath}#${testId}-${configId}`;
  configPathId += 1;
  return configSubDirectory;
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareConfig = async t => {
  const { reject: cancel, promise: cancelled } = makePromiseKit();
  // Sink the rejection to prevent SES from treating the teardown rejection as
  // unhandled. Consumers of `cancelled` attach their own .catch() handlers.
  cancelled.catch(() => {});
  const config = makeConfig(
    'tmp',
    getConfigDirectoryName(t.title, t.context.length),
  );

  await purge(config);
  await start(config);

  const contextObj = { cancel, cancelled, config };
  t.context.push(contextObj);
  return { ...contextObj };
};

/**
 * @param {ReturnType<typeof makeConfig>} config
 * @param {Promise<void>} cancelled
 */
const makeHost = async (config, cancelled) => {
  const { getBootstrap } = await makeEndoClient(
    'client',
    config.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  return { host: E(bootstrap).host() };
};

/** @param {import('ava').ExecutionContext<any>} t */
const prepareHost = async t => {
  const { cancel, cancelled, config } = await prepareConfig(t);
  const { host } = await makeHost(config, cancelled);
  return { cancel, cancelled, config, host };
};

test.beforeEach(t => {
  t.context = [];
});

test.afterEach.always(async t => {
  delete process.env.ENDO_GATEWAY;
  delete process.env.ENDO_GATEWAY_ALLOWED_CIDRS;
  // Stop all daemons first, then cancel the client connections.
  // Stopping first avoids an unhandled rejection race: if cancel() fires
  // before the daemon has shut down, CapTP teardown can produce derivative
  // promises whose rejection reaches the unhandledRejection handler before
  // any .catch() has been attached.
  const configs =
    /** @type {Array<{cancel: Function, cancelled: Promise<void>, config: ReturnType<typeof makeConfig>}>} */ (
      t.context
    );
  await Promise.allSettled(configs.map(({ config }) => stop(config)));
  for (const { cancel, cancelled } of configs) {
    cancelled.catch(() => {});
    cancel(Error('teardown'));
  }
});

// Tests are serial because each forks a full daemon process (SES lockdown,
// CapTP, HTTP server). Running them concurrently in a single ava worker
// causes resource contention that leads to timeouts.

test.serial('daemon writes root file matching @agent identifier', async t => {
  const { config, host } = await prepareHost(t);

  // The daemon writes root before signaling ready, so the file
  // should already exist by the time prepareHost completes.
  const agentIdPath = path.join(config.statePath, 'root');
  const agentIdFromFile = fs.readFileSync(agentIdPath, 'utf-8').trim();

  // The identifier from the file should match what E(host).identify('@agent')
  // returns over CapTP.
  const agentIdFromCapTP = await E(host).identify('@agent');

  t.is(typeof agentIdFromFile, 'string');
  t.truthy(agentIdFromFile.length > 0);
  t.is(agentIdFromFile, agentIdFromCapTP);

  // The root should be a valid formula identifier (number:node format).
  t.regex(agentIdFromFile, /^[0-9a-f]{64}:[0-9a-f]{64}$/);
});
