// @ts-check
/* global process */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import { systemCapture } from '@endo/platform/proc';
import { whereEndoState } from '@endo/where';
import { time } from 'console';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the monorepo root
const repoRoot = path.resolve(dirname, '../..');

// Paths to network modules (file:// URLs for the daemon worker)
const tcpNetstringUrl = pathToFileURL(
  path.join(repoRoot, 'packages/daemon/src/networks/tcp-netstring.js'),
).href;
const libp2pUrl = pathToFileURL(
  path.join(repoRoot, 'packages/daemon/src/networks/libp2p.js'),
).href;
const wsRelayUrl = pathToFileURL(
  path.join(repoRoot, 'packages/daemon/src/networks/ws-relay.js'),
).href;

// Bootstrap specifiers for AI agent setup scripts
const lalSetupUrl = pathToFileURL(
  path.join(repoRoot, 'packages/lal/setup.js'),
).href;
const jaineSetupUrl = pathToFileURL(
  path.join(repoRoot, 'packages/jaine/setup.js'),
).href;

// Path to the endo CLI in this repo
const endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');

// Load .env from repo root for ENDO_LLM_* vars (provider config).
// Does not override vars already set in the shell environment.
const loadDotenv = () => {
  const envPath = path.join(repoRoot, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  }
};

/**
 * Run a short-lived CLI command and resolve/reject based on exit code.
 *
 * @param {string[]} args
 * @param {number} timeoutMs
 */
const runEndoCli = (args, timeoutMs = 1_500) =>
  systemCapture(endoCliPath, args, timeoutMs);

// Set to 0 to disable thrashing when developing daemon
const DAEMON_POLL_INTERVAL_MS = 5_000;

// The daemon may need to reincarnate network modules (libp2p DHT bootstrapping
// can take ~30s), so allow up to 90s.
const DAEMON_START_MAX_WAIT = 90_000;

/**
 * Ping the daemon and return whether it responded.
 *
 * @returns {Promise<boolean>}
 */
const pingDaemon = async () => {
  try {
    const { code } = await runEndoCli(['ping'], 10_000);
    return code === 0;
  } catch {
    return false;
  }
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
 * Daemon health checker and auto-restarter
 */
const makeEndoChecker = () => {
  /** @type {string | undefined} */
  let agentId;
  let daemonHealthy = false;
  /** True while an checkAndRestart() call is in flight. */
  let startingDaemon = false;

  // how many time have we tried, and failed to start the daemon; first one's free
  let failStarts = -1;

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
            `[Endo Plugin] Daemon recovered, agent: ${(agentId || '<NOT_RUNNING>').slice(0, 16)}...`,
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
    await check();
    startingDaemon = false;

    if (daemonHealthy) {
      console.log(
        `[Endo Plugin] Daemon restarted, agent: ${(agentId || '<NOT_RUNNING>').slice(0, 16)}...`,
      );
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

    agentId = undefined;
    daemonHealthy = false;

    console.log('[Endo Plugin] Starting Endo daemon...');
    const { code, stderr } = await runEndoCli(['start'], DAEMON_START_MAX_WAIT);
    if (code === 0) {
      console.log('[Endo Plugin] Endo daemon started');
      agentId = await getAgentId();
      daemonHealthy = true;
      failStarts = 0;
    } else {
      console.error('[Endo Plugin] Failed to start endo daemon');
      for (const line of stderr.split('\n')) {
        console.error(`[Endo Plugin]   ${line}`);
      }
      failStarts++;
    }
  };

  // Monitor daemon liveness and attempt restarts.
  const check = async () => {
    await ensureEndoRunning();
    if (DAEMON_POLL_INTERVAL_MS) {
      // when start fails, backoff on retrying start up to how long we're
      // willing to wait for start to even succeed
      const nextCheck =
        DAEMON_POLL_INTERVAL_MS *
        Math.min(DAEMON_START_MAX_WAIT, Math.pow(2, failStarts));

      if (!daemonHealthy) {
        console.error(
          `[Endo Plugin] Daemon Unhealthy ; next check in ${nextCheck}`,
        );
      }

      setTimeout(checkAndRestart, nextCheck);
    }
  };

  return {
    get healthy() {
      return daemonHealthy;
    },
    get agentId() {
      return agentId || '<NOT_RUNNING>';
    },
    ensure: check,
  };
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
  const endoChecker = makeEndoChecker();
  const gatewayAddress = process.env.ENDO_ADDR || '127.0.0.1:8920';

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
          'import.meta.env.WS_RELAY_PATH': JSON.stringify(wsRelayUrl),
        },
      };
    },

    async configureServer(server) {
      try {
        loadDotenv();
        console.log('[Endo Plugin] Loaded .env from repo root');

        // Set ENDO_EXTRA so the daemon auto-provisions lal/jaine on startup.
        if (!process.env.ENDO_EXTRA) {
          process.env.ENDO_EXTRA = `${lalSetupUrl},${jaineSetupUrl}`;
        }

        await endoChecker.ensure();

        console.log(`[Endo Plugin] Gateway at ${gatewayAddress}`);
        console.log(
          `[Endo Plugin] Agent: ${endoChecker.agentId.slice(0, 16)}...`,
        );
      } catch (error) {
        console.error(`[Endo Plugin] Failed to start:`, error);
        throw error;
      }

      // Returns 200 only when the daemon is confirmed reachable.
      // The client polls this after a disconnect before navigating to /dev.
      server.middlewares.use('/health', (_req, res) => {
        if (endoChecker.healthy) {
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
          const fragment = new URLSearchParams({
            gateway: gatewayAddress,
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
      getAgentId: () => endoChecker.agentId,
    },
  };
};

export default makeEndoPlugin;
