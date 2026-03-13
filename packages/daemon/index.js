// @ts-check
/* global process, setTimeout */

import url from 'url';
import { default as popen, spawn } from 'child_process';
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

const enoentOk = error => {
  if (error.code === 'ENOENT') {
    return;
  }
  throw error;
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
/** @typedef {typeof defaultConfig} Config */

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
 * @param {Record<string, string>} [envOverrides]
 * @returns {Promise<void>}
 */
const startEngo = async (config, envOverrides) => {
  const endoBin = /** @type {string} */ (process.env.ENDO_BIN);

  await fs.promises.mkdir(config.statePath, { recursive: true });
  const logPath = path.join(config.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const endoGoDaemonPath = url.fileURLToPath(
    new URL('src/daemon-go.js', import.meta.url),
  );

  const env = {
    ...process.env,
    ...envOverrides,
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

/**
 * @param {Config} [config]
 * @param {object} [options]
 * @param {Record<string, string>} [options.env] - overrides for process.env
 * @param {boolean} [options.feralErrors] - enable to turn off lockdown error stack trace sanitization
 * @param {boolean} [options.foreground] - if enabled, the daemon will be spawn-ed instead of fork-ed;
 *                                         the current process will wait for and then exit,
 *                                         behaving as if execv had been a thing that node could call;
 *                                         i.e. this causes `start()` to effectively never return
 * @param {boolean} [options.gcEnabled] - enable GC of TODO what exactly?
 */
export const start = async (
  config = defaultConfig,
  { env: envOverrides = {}, feralErrors, foreground = false, gcEnabled } = {},
) => {
  if (feralErrors) {
    envOverrides.LOCKDOWN_ERROR_TAMING = 'unsafe';
  }
  if (gcEnabled === true) {
    envOverrides.ENDO_GC = '1';
  }

  await clean(config);
  if (process.env.ENDO_BIN) {
    return startEngo(config, envOverrides);
  }

  await fs.promises.mkdir(config.statePath, {
    recursive: true,
  });
  const logPath = path.join(config.statePath, 'endo.log');
  const output = fs.openSync(logPath, 'a');

  const daemonPath =
    process.env.ENDO_DAEMON_PATH ||
    url.fileURLToPath(new URL('src/daemon-node.js', import.meta.url));
  const daemonArgs = [
    config.sockPath,
    config.statePath,
    config.ephemeralStatePath,
    config.cachePath,
  ];

  if (foreground) {
    // NOTE ideally this would be execv replacement, but node does not ship a stdlib binding for that?

    let daemonExe = daemonPath;
    if (daemonPath.endsWith('.js')) {
      daemonArgs.unshift(daemonPath);
      daemonExe = process.execPath; // Use the current Node.js executable path
    }

    const child = spawn(daemonExe, daemonArgs, {
      stdio: 'inherit',
      detached: false,
    });

    /** @type {Promise<number>} */
    const childDone = new Promise(resolve => {
      child.on('error', err => {
        console.error(
          'Failed to spawn daemon:',
          [daemonExe, ...daemonArgs],
          err,
        );
        resolve(1);
      });
      child.on('exit', code => resolve(code || 0));
    });

    process.exit(await childDone);
  }

  const child = popen.fork(daemonPath, daemonArgs, {
    detached: true,
    env: { ...process.env, ...envOverrides },
    stdio: ['ignore', output, output, 'ipc'],
  });

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
          for await (const _ of politeEndProcess(workerPid)) {
          }
        }
        await fs.promises.rm(pidPath, { force: true });
      } catch {
        /* no pid file */
      }
    }),
  );
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
 * @typedef {{kill: string}} KillStep
 * @typedef {{wait: number}} WaitStep
 * @typedef {{notify: 'throw'|'error'|'warn'}} NotifyStep
 * @typedef {KillStep|WaitStep|NotifyStep} EndProcStep
 * @typedef {Array<EndProcStep>} EndProcPolicy
 */

/** @type {EndProcPolicy} */
const defaultEndProcPolicy = harden([
  { kill: 'SIGTERM' },
  { wait: 2_000 }, // try SIGTERM for 2s
  { kill: 'SIGKILL' },
  { wait: 400 }, // try SIGKILL for 0.4s
  { notify: 'warn' }, // or warn of zombie remnant
]);

/**
 * Process a sequence of steps to gracefully stop a process.
 *
 * Each step is either wait for a duration or send a signal to kill the process.
 *
 * @param {number} pid - Process ID to stop
 * @param {object} options
 * @param {number} [options.waitBefore] - convenience for an initial wait before following process end steps;
 *                                        equivalent to passing `steps: [ { wait: NNN }, ...defaultEndProcPolicy ]`
 * @param {EndProcPolicy} [options.steps=defaultEndProcPolicy] - sequence of signals and wait-for-exit timeouts to follow
 * @param {number} [options.pollInterval] - how long to sleep between wait-for-exit checks (within per-step timeout)
 * @param {boolean} [options.verbose=true] - whether to log signals sent
 */
export async function* politeEndProcess(
  pid,
  {
    waitBefore,
    steps = defaultEndProcPolicy,
    pollInterval = 100,
    verbose = true,
  } = {},
) {
  if (typeof waitBefore === 'number') {
    steps = [{ wait: waitBefore }, ...steps];
  }

  const isAlive = () => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  /** @param {number} deadline */
  async function* waitForExit(deadline) {
    while (Date.now() < deadline) {
      if (!isAlive()) {
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => {
        setTimeout(resolve, pollInterval);
      });
    }
  }

  for (const step of steps) {
    if (!isAlive()) {
      return;
    }

    if ('kill' in step) {
      const signal = step.kill || 'SIGTERM';
      if (verbose) {
        console.info(`kill ${pid} ${signal}`);
      }
      try {
        process.kill(pid, signal);
      } catch {
        // Already dead
        return;
      }
    } else if ('wait' in step) {
      yield* waitForExit(Date.now() + step.wait);
    } else if ('notify' in step) {
      const { notify } = step;
      const message = `Zombie process ${pid} remains after SIGKILL`;
      switch (notify) {
        case 'error':
          console.error(message);
          return;
        case 'warn':
          console.warn(message);
          return;
        case 'throw':
          throw new Error(message);
        default:
          throw new Error(`unknown notify:${notify}`);
      }
    }
  }
}

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
  for await (const _ of politeEndProcess(pid, {
    // Wait up to 5s for the process to exit on its own
    // (graceful shutdown from a prior terminate() call).
    waitBefore: 5_000,
  })) {
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
  await killWorkersByPidFiles(config.ephemeralStatePath);
  await clean(config);
};

/**
 * @param {typeof defaultConfig} [config]
 * @param {{ env?: Record<string, string>, gcEnabled?: boolean, feralErrors?: boolean }} [options]
 */
export const restart = async (config = defaultConfig, options = {}) => {
  await stop(config);
  return start(config, options);
};

export const purge = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await killDaemonProcess(config);
  await killWorkersByPidFiles(config.ephemeralStatePath);

  await Promise.all([
    clean(config),
    removePath(config.statePath).catch(enoentOk),
    removePath(config.ephemeralStatePath).catch(enoentOk),
    removePath(config.cachePath).catch(enoentOk),
  ]);
};
