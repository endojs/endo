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

const removePath = async removalPath => {
  return fs.promises
    .rm(removalPath, { recursive: true, force: true })
    .catch(cause => {
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

const defaultConfig = {
  statePath: whereEndoState(process.platform, process.env, info),
  ephemeralStatePath: whereEndoEphemeralState(
    process.platform,
    process.env,
    info,
  ),
  sockPath: whereEndoSock(process.platform, process.env, info),
  cachePath: whereEndoCache(process.platform, process.env, info),
};

const endoDaemonPath =
  process.env.ENDO_DAEMON_PATH ||
  url.fileURLToPath(new URL('src/daemon-node.js', import.meta.url));

export const terminate = async (config = defaultConfig) => {
  const { resolve: cancel, promise: cancelled } = makePromiseKit();
  const { getBootstrap, closed } = await makeEndoClient(
    'harbinger',
    config.sockPath,
    cancelled,
    undefined,
    { onReject: () => {} },
  );
  const bootstrap = getBootstrap();
  await E(bootstrap)
    .terminate()
    .catch(() => {});
  // @ts-expect-error zero-argument promise resolve
  cancel();
  await closed.catch(() => {});
};

/**
 * @param {typeof defaultConfig} [config]
 * @param {{ env?: Record<string, string> }} [options]
 */
export const start = async (config = defaultConfig, { env: envOverrides } = {}) => {
  await clean(config);
  await fs.promises.mkdir(config.statePath, {
    recursive: true,
  });
  const logPath = path.join(config.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const env = { ...process.env, ...envOverrides };

  const child = popen.fork(
    endoDaemonPath,
    [
      config.sockPath,
      config.statePath,
      config.ephemeralStatePath,
      config.cachePath,
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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @param {string} ephemeralStatePath
 */
const killWorkersByPidFiles = async ephemeralStatePath => {
  const workerDir = path.join(ephemeralStatePath, 'worker');
  /** @type {string[]} */
  let workerIds;
  try {
    workerIds = await fs.promises.readdir(workerDir);
  } catch {
    return;
  }
  await Promise.all(
    workerIds.map(async workerId => {
      const pidPath = path.join(workerDir, workerId, 'worker.pid');
      try {
        const pidText = await fs.promises.readFile(pidPath, 'utf-8');
        const workerPid = Number(pidText);
        if (Number.isFinite(workerPid) && workerPid > 0) {
          try {
            process.kill(workerPid, 'SIGKILL');
          } catch {
            /* already gone */
          }
        }
        await fs.promises.rm(pidPath, { force: true });
      } catch {
        /* no pid file */
      }
    }),
  );
};

const enoentOk = error => {
  if (error.code === 'ENOENT') {
    return;
  }
  throw error;
};

export const clean = async (config = defaultConfig) => {
  await null;
  if (process.platform !== 'win32') {
    await removePath(config.sockPath).catch(enoentOk);
  }
};

export const stop = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await delay(2000);
  await killWorkersByPidFiles(config.ephemeralStatePath);
  await clean(config);
};

/**
 * @param {typeof defaultConfig} [config]
 * @param {{ env?: Record<string, string> }} [options]
 */
export const restart = async (config = defaultConfig, options = {}) => {
  await stop(config);
  return start(config, options);
};

export const purge = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await delay(2000);
  await killWorkersByPidFiles(config.ephemeralStatePath);

  await Promise.all([
    clean(config),
    removePath(config.statePath).catch(enoentOk),
    removePath(config.ephemeralStatePath).catch(enoentOk),
    removePath(config.cachePath).catch(enoentOk),
  ]);
};
