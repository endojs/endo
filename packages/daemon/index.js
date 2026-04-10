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

import { waitForExit, waitForMessage, waitForSpawn } from '@endo/platform/proc';

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

/**
 * Used to filter ambient env when building background daemon env.
 *
 * @param {string} key
 */
const allowEnvPass = key => {
  // TODO probably better to use a more restrictive whitelist
  return (
    key.startsWith('LOCKDOWN_') || key.startsWith('ENDO_')
    // || key.startsWith('XDG_') // NOTE should not be necessary, as these are already systemd-injected
    // || key === 'ONLY_WELL_FORMED_STRINGS_PASSABLE' // TODO need?
  );
};

/**
 * Filters ambient environment ( aka process.env ) to only allowable daemon entries.
 *
 * @param {{[key: string]: string|undefined}} [env]
 * @returns {Array<[key: string, value: string]>} filteredEntries
 */
const filterEnv = (env = process.env) => {
  return Object.entries(env)
    .filter(([key]) => allowEnvPass(key))
    .map(([key, value = '']) => [key, value]);
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
  address: process.env.ENDO_ADDR || '127.0.0.1:8920',
  gcEnabled: process.env.ENDO_GC === '1',
};
/** @typedef {typeof defaultConfig} Config */

/**
 * @param {Config} config
 */
const configToEnv = config => ({
  ENDO_STATE_PATH: config.statePath,
  ENDO_EPHEMERAL_STATE_PATH: config.ephemeralStatePath,
  ENDO_SOCK_PATH: config.sockPath,
  ENDO_CACHE_PATH: config.cachePath,
  ENDO_ADDR: config.address,
  ENDO_GC: config.gcEnabled ? '1' : '',
});

/**
 * @param {{[key: string]: string|undefined}} env
 * @returns {Config}
 */
const configFromEnv = env => {
  const {
    ENDO_STATE_PATH: statePath = defaultConfig.statePath,
    ENDO_EPHEMERAL_STATE_PATH:
      ephemeralStatePath = defaultConfig.ephemeralStatePath,
    ENDO_SOCK_PATH: sockPath = defaultConfig.sockPath,
    ENDO_CACHE_PATH: cachePath = defaultConfig.cachePath,
    ENDO_ADDR: address = defaultConfig.address,
    ENDO_GC: gcEnabledStr,
  } = env;
  return {
    statePath,
    ephemeralStatePath,
    sockPath,
    cachePath,
    address,
    gcEnabled: gcEnabledStr === '1',
  };
};

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
 * @param {string[]} _args
 */
export const main = async _args => {
  const config = configFromEnv(process.env);

  // TODO implement option parsing for final env toggle like GC, LOCKDOWN_ERROR_TAMING, etc

  const child = process.env.ENDO_BIN
    ? await runEngo(false, config)
    : await runEndo(false, config);
  process.exit(await waitForExit(child));
};

/**
 * Start the engo (Go supervisor) binary, passing config paths via
 * environment variables, and wait for the daemon socket to become ready.
 *
 * @param {boolean} detached - if process should be detached from current stdio
 * @param {Config} config
 * @returns {Promise<popen.ChildProcess>}
 */
const runEngo = async (detached, config) => {
  const endoBin = path.resolve(/** @type {string} */ (process.env.ENDO_BIN));

  await fs.promises.mkdir(config.statePath, { recursive: true });
  const logPath = path.join(config.statePath, 'endo.log');

  const endoGoDaemonPath = url.fileURLToPath(
    new URL('src/daemon-go.js', import.meta.url),
  );

  const env = {
    ...configToEnv(config),
    ...Object.fromEntries(filterEnv()),
    ENDO_DAEMON_PATH: endoGoDaemonPath,
    // engo spawns node as a child process and needs PATH to find it.
    PATH: process.env.PATH || '',
  };

  const stdio = /** @type {popen.StdioOptions} */ (
    /** @type {unknown} */
    (
      (() => {
        if (detached) {
          const output = fs.openSync(logPath, 'a');
          return ['ignore', output, output];
        } else {
          return ['inherit', 'inherit', 'inherit'];
        }
      })()
    )
  );

  const child = popen.spawn(endoBin, ['daemon'], {
    detached,
    env,
    stdio,
  });
  await waitForSpawn(child);

  // Wait for the socket to accept connections (fast).
  await waitForSocket(config.sockPath);

  // Also wait for the root file to be written. The daemon writes this
  // after the socket is open but before sending the "ready" envelope.
  // Without this, tests that read the root file immediately may race.
  const rootPath = path.join(config.statePath, 'root');
  await waitForFile(rootPath);

  return child;
};

/**
 * Start the endo (Node.js supervisor), passing config paths via
 * environment variables, and wait for the daemon socket to become ready.
 *
 * @param {boolean} detached - if process should be detached from current stdio
 * @param {Config} config
 * @returns {Promise<popen.ChildProcess>}
 */
const runEndo = async (detached, config) => {
  await fs.promises.mkdir(config.statePath, {
    recursive: true,
  });
  const logPath = path.join(config.statePath, 'endo.log');

  const daemonPath =
    process.env.ENDO_DAEMON_PATH ||
    url.fileURLToPath(new URL('src/daemon-node.js', import.meta.url));

  // TODO modify node-powers to just rely on ENDO_* passed like engo by configToEnv
  const daemonArgs = [
    config.sockPath,
    config.statePath,
    config.ephemeralStatePath,
    config.cachePath,
  ];

  const env = {
    ...configToEnv(config),
    ...Object.fromEntries(filterEnv()),
  };

  const stdio = /** @type {popen.StdioOptions} */ (
    /** @type {unknown} */
    (
      (() => {
        if (detached) {
          const output = fs.openSync(logPath, 'a');
          return ['ignore', output, output, 'ipc'];
        } else {
          return ['inherit', 'inherit', 'inherit', 'ipc'];
        }
      })()
    )
  );

  const child = popen.spawn(process.execPath, [daemonPath, ...daemonArgs], {
    detached,
    env,
    stdio,
  });

  // waitForSpawn is unnecessary here: waitForMessage already listens
  // for the 'error' event on the child process.
  const message = await waitForMessage(child).catch(cause => {
    throw Error(`Daemon failed to spawn ${cause.message}, see (${logPath})`);
  });
  child.disconnect();

  if (typeof message === 'object' && message !== null && 'type' in message) {
    if (message.type === 'ready') {
      // This message corresponds to process.send({ type: 'ready' }) in
      // src/daemon-node-powers.js and indicates the daemon is ready to receive
      // clients.
      console.debug('endo daemon ready', message);
    } else if (
      message.type === 'error' &&
      'message' in message &&
      typeof message.message === 'string'
    ) {
      throw new Error(message.message);
    }
  }

  return child;
};

/**
 * @param {Config} [config]
 * @param {object} [options]
 * @param {number} [options.verbose] - verbosity level of status
 */
export const status = async (config = defaultConfig, { verbose = 0 } = {}) => {
  if (verbose > 0) {
    console.log('verbosity:', verbose);
    console.log('config:', config);
  }

  const pidPath = path.join(config.ephemeralStatePath, 'endo.pid');
  const pid = await readPidFile(pidPath);
  console.log(`pid: ${pid || 'NOT RUNNING'}`);
  const running = !!pid;

  // TODO interrogate process details if verbose > 0

  /**
   * @param {string} filePath
   */
  const describeFile = filePath => {
    try {
      const stats = fs.statSync(filePath);
      if (verbose < 1) {
        return '';
      } else if (stats.isFIFO()) {
        return 'FIFO';
      } else if (stats.isSocket()) {
        return 'Socket';
      } else if (stats.isDirectory()) {
        return 'Directory';
      } else if (stats.isFile()) {
        return `size:${stats.size}`;
      } else {
        return `Special(mode:o${stats.mode.toString(8)})`;
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        return 'MISSING';
      } else {
        return `StatError:${err.message}`;
      }
    }
  };

  const showFiles = {
    logPath: path.join(config.statePath, 'endo.log'),
    rootPath: path.join(config.statePath, 'root'),
    sockPath: config.sockPath,
  };
  for (const [name, filePath] of Object.entries(showFiles)) {
    const fileDesc = describeFile(filePath);
    if (fileDesc) {
      console.log(`${name}: ${filePath} -- ${fileDesc}`);
    }
  }

  // TODO we could run `du -csh ${cachePath}` if verbose > 1
  // config.cachePath

  if (running) {
    console.log('Running Workers:');
    for await (const worker of runningWorkers(config)) {
      const workerPid = await worker.pid;
      if (workerPid !== null) {
        const label = await worker.label();
        console.log(`* id:${worker.id} name:${label} pid:${workerPid}`);
      }
    }
  }
};

/**
 * @param {Config} [config]
 * @param {object} [options]
 * @param {boolean} [options.dryRun] - log what would be done, don't do it
 */
export const start = async (
  config = defaultConfig,
  { dryRun = false } = {},
) => {
  if (dryRun) {
    console.log(`would clean(${config})`);
    // TODO pushdown like await clean(config, {dryRun});
  } else {
    await clean(config);
  }

  // TODO less indirection when running $ENDO_BIN, rather than going back through node just to call runEngo()

  if (dryRun) {
    console.log(
      `would directly fork ${process.env.ENDO_BIN ? 'engo' : 'endo'}`,
    );
    return;
  }

  const child = await (process.env.ENDO_BIN
    ? runEngo(true, config)
    : runEndo(true, config));

  child.unref();
};

/**
 * @param {object} options
 * @param {Config} options.config
 * @param {string} options.workerId
 * @param {string} [options.workerRunDir]
 * @param {string} [options.workerStateDir]
 */
const runningWorker = ({
  config,
  workerId,
  workerRunDir = path.join(config.ephemeralStatePath, 'worker', workerId),
  workerStateDir = path.join(config.statePath, 'worker', workerId),
}) => {
  const pidPath = path.join(workerRunDir, 'worker.pid');

  const metaPath = path.join(workerStateDir, 'worker.meta.json');
  const metaText = fs.promises.readFile(metaPath, 'utf-8');
  const metaData = metaText.then(text => JSON.parse(text)).catch(() => null);

  return {
    get id() {
      return workerId;
    },

    get runDir() {
      return workerRunDir;
    },

    get pidPath() {
      return pidPath;
    },
    get logPath() {
      return path.join(workerStateDir, 'worker.log');
    },

    pid: (async () => {
      try {
        const pidText = await fs.promises.readFile(pidPath, 'utf-8');
        const rawPid = Number(pidText);
        if (Number.isFinite(rawPid) && rawPid > 0) {
          return rawPid;
        }
      } catch {
        // PID file may not exist or be readable
      }
      return null;
    })(),

    async label() {
      // TODO use M?
      const meta = await metaData;
      if (typeof meta !== 'object') return '';
      if (!('label' in meta)) return '';
      const { label } = meta;
      return `${label}`;
    },
  };
};

/**
 * @param {Config} config
 */
const runningWorkers = async function* (config) {
  const workerDir = path.join(config.ephemeralStatePath, 'worker');
  /** @type {string[]} */
  let workerIds;
  try {
    workerIds = await fs.promises.readdir(workerDir);
  } catch {
    return;
  }
  for (const workerId of workerIds) {
    yield runningWorker({
      config,
      workerId,
      workerRunDir: path.join(workerDir, workerId),
    });
  }
};

/**
 * @param {Config} config
 */
const killWorkersByPidFiles = async config => {
  /** @type {Array<Promise<void>>} */
  const pending = [];
  for await (const worker of runningWorkers(config)) {
    pending.push(
      (async () => {
        const workerPid = await worker.pid;
        if (workerPid !== null) {
          await politeEndProcess(workerPid);
        }
        await fs.promises
          .rm(worker.pidPath, { force: true })
          .catch(() => undefined);
      })(),
    );
  }
  await Promise.all(pending);
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
export async function politeEndProcess(
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
  async function pollUntilExit(deadline) {
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
      // eslint-disable-next-line no-await-in-loop
      await pollUntilExit(Date.now() + step.wait);
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
  await politeEndProcess(pid, {
    // Wait up to 5s for the process to exit on its own
    // (graceful shutdown from a prior terminate() call).
    waitBefore: 5_000,
  });
};

export const clean = async (config = defaultConfig) => {
  await null;
  if (process.platform !== 'win32') {
    await removePath(config.sockPath).catch(enoentOk);
  }
  const pidPath = path.join(config.ephemeralStatePath, 'endo.pid');
  await fs.promises.rm(pidPath, { force: true }).catch(enoentOk);
};

/**
 * @param {Config} config
 */
export const stop = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await killDaemonProcess(config);
  await killWorkersByPidFiles(config);
  await clean(config);
};

/**
 * @param {typeof defaultConfig} [config]
 */
export const restart = async (config = defaultConfig) => {
  await stop(config);
  return start(config);
};

export const purge = async (config = defaultConfig) => {
  await terminate(config).catch(() => {});
  await killDaemonProcess(config);
  await killWorkersByPidFiles(config);

  await Promise.all([
    clean(config),
    removePath(config.statePath).catch(enoentOk),
    removePath(config.ephemeralStatePath).catch(enoentOk),
    removePath(config.cachePath).catch(enoentOk),
  ]);
};
