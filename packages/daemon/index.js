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

const removePathInternal = async removalPath => {
  // workaround for windows wonkiness
  if (os.platform() === 'win32') {
    const { windows: windowsDelete } = await import('rimraf');
    return windowsDelete(removalPath);
  }
  return fs.promises.rm(removalPath, { recursive: true, force: true });
};

const removePath = async removalPath => {
  return removePathInternal(removalPath).catch(cause => {
    /** @type {object} */
    const error = new Error(cause.message, { cause });
    error.code = cause.code;
    throw error;
  });
};

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
  new URL('src/daemon-node.js', import.meta.url),
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
  await fs.promises.mkdir(locator.statePath, {
    recursive: true,
  });
  const logPath = path.join(locator.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const env = { ...process.env };
  if (locator.httpPort !== undefined) {
    env.ENDO_HTTP_PORT = `${locator.httpPort}`;
  }

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
      env,
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
    child.on('message', message => {
      child.disconnect();
      child.unref();
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message
      ) {
        if (message.type === 'ready') {
          // This message corresponds to process.send({ type: 'ready' }) in
          // src/daemon-node-powers.js and indicates the daemon is ready to receive
          // clients.
          resolve(undefined);
        } else if (
          message.type === 'error' &&
          'message' in message &&
          typeof message.message === 'string'
        ) {
          reject(new Error(message.message));
        }
      }
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
  await removePath(locator.sockPath).catch(enoentOk);
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

export const resetInternal = async (
  locator = defaultLocator,
  turnOff = false,
) => {
  // Attempt to restore to a running state if currently running, based on
  // whether we manage to terminate it.
  const needsRestart = await terminate(locator).then(
    () => true,
    () => false,
  );

  const cleanedUp = clean(locator);
  const removedState = removePath(locator.statePath).catch(enoentOk);
  const removedEphemeralState = removePath(locator.ephemeralStatePath).catch(
    enoentOk,
  );
  const removedCache = removePath(locator.cachePath).catch(enoentOk);
  await Promise.all([
    cleanedUp,
    removedState,
    removedEphemeralState,
    removedCache,
  ]);

  if (!turnOff && needsRestart) {
    await start(locator);
  }
};

export const reset = async (locator = defaultLocator) =>
  resetInternal(locator, false);
export const teardown = async (locator = defaultLocator) =>
  resetInternal(locator, true);
