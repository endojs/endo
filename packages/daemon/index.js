// @ts-check
/* global process */

import url from 'url';
import popen from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import { whereEndoState, whereEndoSock, whereEndoCache } from '@endo/where';
import { makeEndoClient } from './src/client.js';

// Reexports:
export { makeEndoClient } from './src/client.js';

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = {
  user: username,
  home: homedir,
  temp,
};

const defaultLocator = {
  statePath: whereEndoState(process.platform, process.env, info),
  sockPath: whereEndoSock(process.platform, process.env, info),
  cachePath: whereEndoCache(process.platform, process.env, info),
};

const endoDaemonPath = url.fileURLToPath(
  new URL('src/daemon.js', import.meta.url),
);

export const terminate = async (locator = defaultLocator) => {
  const { resolve: cancel, promise: cancelled } = makePromiseKit();
  const { getBootstrap, closed } = await makeEndoClient(
    'harbinger',
    locator.sockPath,
    cancelled,
  );
  const bootstrap = getBootstrap();
  await E(E.get(bootstrap).privateFacet).terminate();
  cancel();
  await closed;
};

export const start = async (locator = defaultLocator) => {
  const cachePathCreated = fs.promises.mkdir(locator.cachePath, {
    recursive: true,
  });
  const statePathCreated = fs.promises.mkdir(locator.statePath, {
    recursive: true,
  });

  await cachePathCreated;
  const logPath = path.join(locator.statePath, 'endo.log');

  await statePathCreated;
  const output = fs.openSync(logPath, 'a');

  const child = popen.fork(
    endoDaemonPath,
    [locator.sockPath, locator.statePath, locator.cachePath],
    {
      detached: true,
      stdio: ['ignore', output, output, 'ipc'],
    },
  );

  return new Promise((resolve, reject) => {
    child.on('error', (/** @type {Error} */ cause) => {
      reject(
        new Error(
          `Daemon exited prematurely with error ${cause.message}, see (${logPath})`,
        ),
      );
    });
    child.on('exit', (/** @type {number?} */ code) => {
      reject(
        new Error(
          `Daemon exited prematurely with code (${code}), see (${logPath})`,
        ),
      );
    });
    child.on('message', _message => {
      child.disconnect();
      child.unref();
      resolve();
    });
  });
};

const enoentOk = error => {
  if (error.code === 'ENOENT') {
    return;
  }
  throw error;
};

export const clean = async (locator = defaultLocator) => {
  if (process.platform !== 'win32') {
    await fs.promises.rm(locator.sockPath).catch(enoentOk);
  }
};

export const restart = async (locator = defaultLocator) => {
  if (restart) {
    await terminate(locator).catch(() => {});
    await clean(locator);
  }
  return start(locator);
};

export const stop = async (locator = defaultLocator) => {
  return terminate(locator).catch(() => {});
};

export const reset = async (locator = defaultLocator) => {
  const cleanedUp = clean(locator);
  const restated = fs.promises
    .rm(locator.statePath, { recursive: true })
    .catch(enoentOk);
  const cachedOut = fs.promises
    .rm(locator.cachePath, { recursive: true })
    .catch(enoentOk);
  await Promise.all([cleanedUp, restated, cachedOut]);
};
