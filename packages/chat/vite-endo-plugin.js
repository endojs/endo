// @ts-check
/* global process, setInterval, setTimeout, clearTimeout */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { whereEndoState } from '@endo/where';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the monorepo root
const repoRoot = path.resolve(dirname, '../..');

// Paths to network modules (file:// URLs for the daemon worker)
const tcpNetstringUrl = pathToFileURL(path.join(repoRoot, 'packages/daemon/src/networks/tcp-netstring.js')).href;
const libp2pUrl = pathToFileURL(path.join(repoRoot, 'packages/daemon/src/networks/libp2p.js')).href;

// Bootstrap specifiers for AI agent setup scripts
const lalSetupUrl = pathToFileURL(path.join(repoRoot, 'packages/lal/setup.js')).href;
const faeSetupUrl = pathToFileURL(path.join(repoRoot, 'packages/fae/setup.js')).href;

// Path to the endo CLI in this repo
const endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');

/**
 * Run a short-lived CLI command and resolve/reject based on exit code.
 *
 * @param {string[]} args
 * @param {number} timeoutMs
 * @returns {Promise<{ code: number | null, stderr: string }>}
 */
const runEndoCli = (args, timeoutMs = 15000) =>
  new Promise((resolve, reject) => {
    const child = spawn('node', [endoCliPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: repoRoot,
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout running endo ${args.join(' ')}`));
    }, timeoutMs);

    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, stderr });
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });

const DAEMON_POLL_INTERVAL_MS = 5000;

/**
 * Ping the daemon and return whether it responded.
 *
 * @returns {Promise<boolean>}
 */
const pingDaemon = async () => {
  try {
    const { code } = await runEndoCli(['ping'], 10000);
    return code === 0;
  } catch {
    return false;
  }
};

/**
 * Ensure the system Endo daemon is running using this repo's CLI.
 * Pings first to avoid needlessly restarting an already-running daemon.
 *
 * @returns {Promise<void>}
 */
const ensureEndoRunning = async () => {
  console.log('[Endo Plugin] Ensuring Endo daemon is running...');

  if (await pingDaemon()) {
    console.log('[Endo Plugin] Endo daemon is already running');
    return;
  }

  console.log('[Endo Plugin] Starting Endo daemon...');
  try {
    // The daemon may need to reincarnate network modules (libp2p DHT
    // bootstrapping can take ~30s), so allow up to 90s.
    await runEndoCli(['start'], 90000);
    console.log('[Endo Plugin] Endo daemon started');
  } catch (err) {
    throw new Error(
      `Failed to start Endo daemon: ${/** @type {Error} */ (err).message}`,
    );
  }
};

/**
 * Get the gateway address from ENDO_ADDR (default 127.0.0.1:8920).
 *
 * @returns {string}
 */
const getGatewayAddress = () => {
  return process.env.ENDO_ADDR || '127.0.0.1:8920';
};

/**
 * Read the AGENT formula identifier from the daemon's state directory.
 *
 * @returns {Promise<string>}
 */
const getAgentId = async () => {
  const { username, homedir } = os.userInfo();
  const temp = os.tmpdir();
  const info = { user: username, home: homedir, temp };
  const statePath = whereEndoState(process.platform, process.env, info);
  const agentIdPath = path.join(statePath, 'root');
  const contents = await fs.promises.readFile(agentIdPath, 'utf-8');
  return contents.trim();
};

/**
 * Create a Vite plugin that connects to the system Endo daemon's
 * built-in gateway.
 *
 * The plugin:
 * 1. Ensures the system Endo daemon is running (using this repo's CLI)
 * 2. Reads the gateway address and agent ID from daemon state
 * 3. Serves /dev which redirects to /#gateway=...&agent=...
 *    The agent ID travels only in the URL fragment, which browsers never
 *    send back over HTTP in subsequent requests.
 * 4. Serves /health so the client can poll for server availability after
 *    a daemon restart before navigating to /dev.
 *
 * @returns {import('vite').Plugin}
 */
export const makeEndoPlugin = () => {
  /** @type {string | undefined} */
  let gatewayAddress;
  /** @type {string | undefined} */
  let agentId;
  let daemonHealthy = false;
  /** True while an ensureEndoRunning() call is in flight. */
  let startingDaemon = false;

  /**
   * Check daemon liveness and attempt a restart if it's down.
   * Called on a recurring interval after the initial startup.
   */
  const checkAndRestart = async () => {
    if (startingDaemon) return;
    if (await pingDaemon()) {
      if (!daemonHealthy) {
        // Daemon just came back (or was restarted externally).
        try {
          agentId = await getAgentId();
          console.log(
            `[Endo Plugin] Daemon recovered, agent: ${agentId.slice(0, 16)}...`,
          );
        } catch {
          // root file not yet available; will retry next tick.
          return;
        }
      }
      daemonHealthy = true;
      return;
    }

    daemonHealthy = false;
    startingDaemon = true;
    try {
      await ensureEndoRunning();
      agentId = await getAgentId();
      daemonHealthy = true;
      console.log(
        `[Endo Plugin] Daemon restarted, agent: ${agentId.slice(0, 16)}...`,
      );
    } catch (err) {
      console.error(
        `[Endo Plugin] Daemon restart failed:`,
        /** @type {Error} */ (err).message,
      );
    } finally {
      startingDaemon = false;
    }
  };

  return {
    name: 'vite-endo-plugin',
    apply: 'serve',

    config() {
      return {
        define: {
          'import.meta.env.ENDO_GATEWAY': JSON.stringify(''),
          'import.meta.env.ENDO_AGENT': JSON.stringify(''),
          'import.meta.env.TCP_NETSTRING_PATH': JSON.stringify(tcpNetstringUrl),
          'import.meta.env.LIBP2P_PATH': JSON.stringify(libp2pUrl),
        },
      };
    },

    async configureServer(server) {
      try {
        // Set ENDO_EXTRA so the daemon auto-provisions lal/fae on startup.
        if (!process.env.ENDO_EXTRA) {
          process.env.ENDO_EXTRA = `${lalSetupUrl},${faeSetupUrl}`;
        }

        await ensureEndoRunning();

        gatewayAddress = getGatewayAddress();
        agentId = await getAgentId();
        daemonHealthy = true;

        console.log(`[Endo Plugin] Gateway at ${gatewayAddress}`);
        console.log(`[Endo Plugin] Agent: ${agentId.slice(0, 16)}...`);
      } catch (error) {
        console.error(`[Endo Plugin] Failed to start:`, error);
        throw error;
      }

      // Monitor daemon liveness and attempt restarts.
      setInterval(checkAndRestart, DAEMON_POLL_INTERVAL_MS);

      // Returns 200 only when the daemon is confirmed reachable.
      // The client polls this after a disconnect before navigating to /dev.
      server.middlewares.use('/health', (_req, res) => {
        if (daemonHealthy) {
          res.setHeader('Content-Type', 'text/plain');
          res.end('ok');
        } else {
          res.statusCode = 503;
          res.end('daemon unavailable');
        }
      });

      // Redirect to / with the agent ID in the URL fragment.
      // The fragment appears in the Location header, which is fine here:
      // this endpoint is only served by the Vite dev server over localhost,
      // the same trust boundary as the daemon's own Unix socket.  Once the
      // browser follows the redirect, the fragment stays client-side and is
      // never sent back in subsequent HTTP requests.
      server.middlewares.use('/dev', async (_req, res) => {
        try {
          const freshAgentId = await getAgentId();
          agentId = freshAgentId;
          const fragment = new URLSearchParams({
            gateway: gatewayAddress || '',
            agent: freshAgentId,
          });
          res.writeHead(302, { Location: `/#${fragment}` });
          res.end();
        } catch (error) {
          res.statusCode = 503;
          res.end('Daemon not available');
        }
      });
    },

    api: {
      getGatewayAddress: () => gatewayAddress,
      getAgentId: () => agentId,
    },
  };
};

export default makeEndoPlugin;
