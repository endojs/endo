// @ts-check
/* global process, setTimeout */

import url from 'url';
import popen from 'child_process';
import fs from 'fs';
import net from 'net';
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
 * Attempt to connect to a Unix socket. Resolves to `true` if the
 * connection succeeds, `false` otherwise.
 *
 * @param {string} sockPath
 * @returns {Promise<boolean>}
 */
const tryConnect = sockPath =>
  new Promise(resolve => {
    const conn = net.createConnection(sockPath, () => {
      conn.destroy();
      resolve(true);
    });
    conn.on('error', () => resolve(false));
  });

/**
 * Poll until the daemon socket is accepting connections.
 *
 * @param {string} sockPath
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
const waitForSocket = async (sockPath, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // eslint-disable-next-line no-await-in-loop
    if (await tryConnect(sockPath)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
  }
  throw Error(`Socket ${sockPath} not ready within ${timeoutMs}ms`);
};

/**
 * Poll until a file exists on disk.
 *
 * @param {string} filePath
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
const waitForFile = async (filePath, timeoutMs = 10_000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await fs.promises.access(filePath);
      return;
    } catch {
      // File does not exist yet.
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, 50);
    });
  }
  throw Error(`File ${filePath} not found within ${timeoutMs}ms`);
};

/**
 * Start the engo (Go supervisor) binary, passing config paths via
 * environment variables, and wait for the daemon socket to become ready.
 *
 * @param {typeof defaultConfig} config
 * @returns {Promise<void>}
 */
const startEngo = async config => {
  const endoBin = /** @type {string} */ (process.env.ENDO_BIN);

  await fs.promises.mkdir(config.statePath, { recursive: true });
  const logPath = path.join(config.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const endoGoDaemonPath = url.fileURLToPath(
    new URL('src/daemon-go.js', import.meta.url),
  );

  const env = {
    ...process.env,
    ENDO_STATE_PATH: config.statePath,
    ENDO_EPHEMERAL_STATE_PATH: config.ephemeralStatePath,
    ENDO_SOCK_PATH: config.sockPath,
    ENDO_CACHE_PATH: config.cachePath,
    ENDO_DAEMON_PATH: endoGoDaemonPath,
  };

  const child = popen.spawn(endoBin, ['daemon'], {
    detached: true,
    env,
    stdio: ['ignore', output, output],
  });

  child.unref();

  // Wait for the socket to accept connections (fast).
  await waitForSocket(config.sockPath);

  // Also wait for the root file to be written. The daemon writes this
  // after the socket is open but before sending the "ready" envelope.
  // Without this, tests that read the root file immediately may race.
  const rootPath = path.join(config.statePath, 'root');
  await waitForFile(rootPath);
};

export const start = async (config = defaultConfig) => {
  if (process.env.ENDO_BIN) {
    return startEngo(config);
  }

  await fs.promises.mkdir(config.statePath, {
    recursive: true,
  });
  const logPath = path.join(config.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const env = { ...process.env };

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

const enoentOk = error => {
  if (error.code === 'ENOENT') {
    return;
  }
  throw error;
};

/**
 * Read the PID from endo.pid. Returns 0 if the file is missing or
 * unreadable.
 *
 * @param {string} pidPath
 * @returns {Promise<number>}
 */
const readPidFile = async pidPath => {
  try {
    const pidText = await fs.promises.readFile(pidPath, 'utf-8');
    const pid = Number(pidText.trim());
    return pid > 0 ? pid : 0;
  } catch {
    return 0;
  }
};

/**
 * Test whether a process is still alive using signal 0.
 *
 * @param {number} pid
 * @returns {boolean}
 */
const isProcessAlive = pid => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Ensure the daemon process is dead, using endo.pid as a fallback when
 * graceful CapTP termination has already been attempted. Waits for the
 * process to exit on its own first (giving graceful shutdown time),
 * then escalates to SIGTERM and SIGKILL. Works for both the node-only
 * and engo daemon paths.
 *
 * @param {typeof defaultConfig} config
 */
const killDaemonProcess = async config => {
  const pidPath = path.join(config.ephemeralStatePath, 'endo.pid');
  const pid = await readPidFile(pidPath);
  if (pid === 0) {
    return;
  }

  // Wait up to 5 s for the process to exit on its own (graceful
  // shutdown from a prior terminate() call).
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, 100);
    });
  }

  // Still alive — send SIGTERM.
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    // Already dead.
    return;
  }

  // Wait up to 2 s for SIGTERM to take effect.
  const killDeadline = Date.now() + 2_000;
  while (Date.now() < killDeadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => {
      setTimeout(resolve, 100);
    });
  }

  // SIGKILL anything that survived.
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Already dead.
  }
};

export const clean = async (config = defaultConfig) => {
  await null;
  if (process.platform !== 'win32') {
    await removePath(config.sockPath).catch(enoentOk);
  }
  const pidPath = path.join(config.ephemeralStatePath, 'endo.pid');
  await fs.promises.rm(pidPath, { force: true }).catch(enoentOk);
};

export const stop = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await killDaemonProcess(config);
  await clean(config);
};

export const restart = async (config = defaultConfig) => {
  await stop(config);
  return start(config);
};

export const purge = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await killDaemonProcess(config);

  const cleanedUp = clean(config);
  const removedState = removePath(config.statePath).catch(enoentOk);
  const removedEphemeralState = removePath(config.ephemeralStatePath).catch(
    enoentOk,
  );
  const removedCache = removePath(config.cachePath).catch(enoentOk);
  await Promise.all([
    cleanedUp,
    removedState,
    removedEphemeralState,
    removedCache,
  ]);
};
