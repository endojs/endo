// @ts-check
/* global process, setTimeout */

/**
 * Daemon lifecycle management.
 *
 * Spawns the daemon bundle directly (replicating `daemon/index.js` start()
 * logic) instead of going through the CLI, because the bundled CLI resolves
 * `daemon-node.js` via `import.meta.url` which breaks in packaged builds.
 *
 * Uses child_process.spawn (not fork) with the embedded Node binary so the
 * daemon can outlive the Familiar process.
 *
 * Stop and purge still use the CLI since those commands use CapTP client
 * connections and don't have `import.meta.url` resolution issues.
 */

import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

import {
  whereEndoSock,
  whereEndoState,
  whereEndoEphemeralState,
  whereEndoCache,
} from '@endo/where';

import { resourcePaths } from './resource-paths.js';

/** @import { Logger } from './logger.js' */

/**
 * @typedef {object} DaemonStartResult
 * @property {string | undefined} gatewayAddress
 */

/**
 * @typedef {object} DaemonManager
 * @property {() => string} getSockPath
 * @property {() => Promise<boolean>} isDaemonRunning
 * @property {() => Promise<DaemonStartResult>} ensureDaemonRunning
 * @property {() => Promise<DaemonStartResult>} restartDaemon
 * @property {() => Promise<DaemonStartResult>} purgeDaemon
 * @property {() => Promise<string>} getAgentId
 * @property {() => Promise<string>} getGatewayAddress
 */

const { username, homedir } = os.userInfo();
const temp = os.tmpdir();
const info = { user: username, home: homedir, temp };

/**
 * Create a daemon manager with the given logger.
 *
 * @param {Logger} logger
 * @returns {DaemonManager}
 */
const makeDaemonManager = logger => {
  /**
   * Get the Endo daemon Unix socket path for this platform.
   *
   * @returns {string}
   */
  const getSockPath = () => {
    return whereEndoSock(process.platform, process.env, info);
  };

  /**
   * Run an Endo CLI command and return a promise that resolves on success.
   *
   * @param {string[]} args - CLI arguments (e.g., ['stop'], ['purge'])
   * @returns {Promise<void>}
   */
  const runEndoCommand = args => {
    return new Promise((resolve, reject) => {
      const child = spawn(
        resourcePaths.nodePath,
        [resourcePaths.endoCliPath, ...args],
        {
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );

      let stderr = '';
      child.stderr.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', code => {
        if (code === 0) {
          resolve(undefined);
          return;
        }
        reject(
          new Error(`endo ${args.join(' ')} failed (code ${code}): ${stderr}`),
        );
      });

      child.on('error', reject);

      setTimeout(() => {
        child.kill();
        reject(new Error(`Timeout running endo ${args.join(' ')}`));
      }, 30000);
    });
  };

  /**
   * Probe whether the Endo daemon is running by attempting to connect
   * to its Unix socket.
   *
   * @returns {Promise<boolean>}
   */
  const isDaemonRunning = () => {
    const sockPath = getSockPath();
    return new Promise(resolve => {
      const socket = net.connect(sockPath, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => {
        resolve(false);
      });
    });
  };

  /**
   * Start the Endo daemon by spawning the daemon bundle directly.
   *
   * Replicates `daemon/index.js` start() logic: resolves config paths,
   * creates the state directory, opens the log file, and spawns the daemon
   * process with IPC to wait for the ready signal.
   *
   * @returns {Promise<DaemonStartResult>} The gateway address from the IPC ready message.
   */
  const startDaemon = async () => {
    const sockPath = getSockPath();
    const statePath = whereEndoState(process.platform, process.env, info);
    const ephemeralStatePath = whereEndoEphemeralState(
      process.platform,
      process.env,
      info,
    );
    const cachePath = whereEndoCache(process.platform, process.env, info);

    await fs.promises.mkdir(statePath, { recursive: true });

    const logPath = path.join(statePath, 'endo.log');
    const output = fs.openSync(logPath, 'a');

    const child = spawn(
      resourcePaths.nodePath,
      [
        resourcePaths.endoDaemonPath,
        sockPath,
        statePath,
        ephemeralStatePath,
        cachePath,
      ],
      {
        detached: true,
        env: {
          ...process.env,
          ENDO_WORKER_SUBPROCESS_PATH: resourcePaths.workerSubprocessPath,
          ...(resourcePaths.endoLalSetupPath
            ? {
                ENDO_EXTRA: pathToFileURL(resourcePaths.endoLalSetupPath).href,
              }
            : {}),
        },
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
      child.on('message', message => {
        child.disconnect();
        child.unref();
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message
        ) {
          const msg = /** @type {Record<string, unknown>} */ (message);
          if (msg.type === 'ready') {
            resolve({
              gatewayAddress:
                typeof msg.gatewayAddress === 'string'
                  ? msg.gatewayAddress
                  : undefined,
            });
          } else if (msg.type === 'error' && typeof msg.message === 'string') {
            reject(new Error(msg.message));
          }
        }
      });
    });
  };

  /**
   * Ensure the Endo daemon is running, starting it if necessary.
   *
   * @returns {Promise<DaemonStartResult>}
   */
  const ensureDaemonRunning = async () => {
    const running = await isDaemonRunning();
    if (!running) {
      logger.log('[Familiar] Starting Endo daemon...');
      const result = await startDaemon();
      logger.log('[Familiar] Endo daemon started');
      return result;
    } else {
      logger.log('[Familiar] Endo daemon is already running');
      return { gatewayAddress: undefined };
    }
  };

  /**
   * Restart the Endo daemon (stop via CLI, then start directly).
   *
   * @returns {Promise<DaemonStartResult>}
   */
  const restartDaemon = async () => {
    logger.log('[Familiar] Restarting Endo daemon...');
    await runEndoCommand(['stop']);
    const result = await startDaemon();
    logger.log('[Familiar] Endo daemon restarted');
    return result;
  };

  /**
   * Purge the Endo daemon (terminate and remove all state via CLI,
   * then start directly).
   *
   * @returns {Promise<DaemonStartResult>}
   */
  const purgeDaemon = async () => {
    logger.log('[Familiar] Purging Endo daemon...');
    await runEndoCommand(['purge']);
    const result = await startDaemon();
    logger.log('[Familiar] Endo daemon purged and restarted');
    return result;
  };

  /**
   * Read the AGENT formula identifier from the state directory.
   *
   * The daemon writes this file during startup after looking up the
   * AGENT special name on the default host.
   *
   * @returns {Promise<string>}
   */
  const getAgentId = async () => {
    await null;
    const statePath = whereEndoState(process.platform, process.env, info);
    const agentIdPath = path.join(statePath, 'root');
    const contents = await fs.promises.readFile(agentIdPath, 'utf-8');
    return contents.trim();
  };

  /**
   * Read the gateway address from the state directory file, falling back
   * to ENDO_ADDR env var or the default 127.0.0.1:8920.
   *
   * The daemon writes `{statePath}/gateway` after the gateway binds.
   * The file contains a URL like `http://127.0.0.1:8920`.  We strip the
   * scheme and return `host:port`.
   *
   * @returns {Promise<string>}
   */
  const getGatewayAddress = async () => {
    try {
      const statePath = whereEndoState(process.platform, process.env, info);
      const gatewayPath = path.join(statePath, 'gateway');
      const raw = (await fs.promises.readFile(gatewayPath, 'utf-8')).trim();
      // File contains a URL like "http://127.0.0.1:8920"; extract host:port.
      const parsed = new URL(raw);
      return `${parsed.hostname}:${parsed.port || '8920'}`;
    } catch {
      return process.env.ENDO_ADDR || '127.0.0.1:8920';
    }
  };

  return {
    getSockPath,
    isDaemonRunning,
    ensureDaemonRunning,
    restartDaemon,
    purgeDaemon,
    getAgentId,
    getGatewayAddress,
  };
};

export { makeDaemonManager };
