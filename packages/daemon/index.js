// @ts-check
/* global process */

import url from 'url';
import popen from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
import {
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoSock,
  whereEndoCache,
} from '@endo/where';
import { makeEndoClient } from './src/client.js';

// Reexports:
export { makeEndoClient } from './src/client.js';
export { makeRefReader, makeRefIterator } from './src/ref-reader.js';
export { makeReaderRef, makeIteratorRef } from './src/reader-ref.js';

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = {
  user: username,
  home: homedir,
  temp,
};

const defaultLocator = {
  statePath: whereEndoState(process.platform, process.env, info),
  ephemeralStatePath: whereEndoEphemeralState(
    process.platform,
    process.env,
    info,
  ),
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
  await E(bootstrap)
    .terminate()
    .catch(() => {});
  // @ts-expect-error zero-argument promise resolve
  cancel();
  await closed.catch(() => {});
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
    [
      locator.sockPath,
      locator.statePath,
      locator.ephemeralStatePath,
      locator.cachePath,
    ],
    {
      detached: true,
      stdio: ['ignore', output, output, 'ipc'],
    },
  );

  return new Promise((resolve, reject) => {
    child.on('error', (/** @type {Error} */ cause) => {
      reject(
        Error(
          `Daemon exited prematurely with error ${cause.message}, see (${logPath})`,
        ),
      );
    });
    child.on('exit', (/** @type {number?} */ code) => {
      reject(
        Error(
          `Daemon exited prematurely with code (${code}), see (${logPath})`,
        ),
      );
    });
    child.on('message', _message => {
      child.disconnect();
      child.unref();
      // @ts-expect-error zero-argument promise resolve
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
  await terminate(locator).catch(() => {});
  await clean(locator);
  return start(locator);
};

export const stop = async (locator = defaultLocator) => {
  await terminate(locator).catch(() => {});
  await clean(locator);
};

export const reset = async (locator = defaultLocator) => {
  // Attempt to restore to a running state if currently running, based on
  // whether we manage to terminate it.
  const needsRestart = await terminate(locator).then(
    () => true,
    () => false,
  );

  const cleanedUp = clean(locator);
  const removedState = fs.promises
    .rm(locator.statePath, { recursive: true })
    .catch(enoentOk);
  const removedEphemeralState = fs.promises
    .rm(locator.ephemeralStatePath, { recursive: true })
    .catch(enoentOk);
  const removedCache = fs.promises
    .rm(locator.cachePath, { recursive: true })
    .catch(enoentOk);
  await Promise.all([
    cleanedUp,
    removedState,
    removedEphemeralState,
    removedCache,
  ]);

  if (needsRestart) {
    await start(locator);
  }
};
