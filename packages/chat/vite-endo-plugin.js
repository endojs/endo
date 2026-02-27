// @ts-check
/* global setTimeout, process */

import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the monorepo root
const repoRoot = path.resolve(dirname, '../..');

// Paths to network modules (file:// URLs for the daemon worker)
const tcpNetstringUrl = `file://${path.join(repoRoot, 'packages/daemon/src/networks/tcp-netstring.js')}`;
const libp2pUrl = `file://${path.join(repoRoot, 'packages/daemon/src/networks/libp2p.js')}`;

// Path to the endo CLI in this repo
const endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');

// Path to the gateway server script
const gatewayServerPath = path.join(dirname, 'scripts/gateway-server.js');

/**
 * @typedef {object} EndoPluginOptions
 * @property {number} [port] - Requested gateway port (0 = host-assigned)
 */

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

    child.on('close', code => resolve({ code, stderr }));
    child.on('error', reject);

    setTimeout(() => {
      child.kill();
      reject(new Error(`Timeout running endo ${args.join(' ')}`));
    }, timeoutMs);
  });

/**
 * Ensure the system Endo daemon is running using this repo's CLI.
 * Pings first to avoid needlessly restarting an already-running daemon.
 *
 * @returns {Promise<void>}
 */
const ensureEndoRunning = async () => {
  console.log('[Endo Plugin] Ensuring Endo daemon is running...');

  try {
    const { code } = await runEndoCli(['ping'], 10000);
    if (code === 0) {
      console.log('[Endo Plugin] Endo daemon is already running');
      return;
    }
  } catch {
    // ping failed or timed out — fall through to start
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
 * Start the gateway server and get connection info.
 *
 * @param {number} port
 * @returns {Promise<{ httpPort: number, endoId: string, process: import('child_process').ChildProcess }>}
 */
const startGatewayServer = async port => {
  return new Promise((resolve, reject) => {
    console.log('[Endo Plugin] Starting gateway server...');

    const child = spawn('node', [gatewayServerPath, JSON.stringify({ port })], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: dirname,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    child.stdout.on('data', data => {
      stdout += data.toString();

      // Try to parse the JSON output (first complete line)
      if (!resolved) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          try {
            const result = JSON.parse(line);
            if (result.httpPort && result.endoId) {
              resolved = true;
              resolve({ ...result, process: child });
              return;
            }
          } catch {
            // Not JSON yet, keep waiting
          }
        }
      }
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
      // Log gateway server stderr to console
      process.stderr.write(data);
    });

    child.on('close', code => {
      if (!resolved) {
        reject(new Error(`Gateway server exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', error => {
      if (!resolved) {
        reject(error);
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!resolved) {
        child.kill();
        reject(new Error('Timeout waiting for gateway server to start'));
      }
    }, 30000);
  });
};

/**
 * Create a Vite plugin that connects to the system Endo daemon.
 *
 * The plugin:
 * 1. Ensures the system Endo daemon is running (using this repo's CLI)
 * 2. Starts a gateway server for WebSocket access
 * 3. Injects ENDO_GATEWAY and ENDO_AGENT as environment variables
 *
 * @param {EndoPluginOptions} [options]
 * @returns {import('vite').Plugin}
 */
export const makeEndoPlugin = (options = {}) => {
  const { port = 0 } = options;

  /** @type {string | undefined} */
  let gatewayAddress;
  /** @type {string | undefined} */
  let agentId;
  /** @type {import('child_process').ChildProcess | undefined} */
  let gatewayProcess;

  return {
    name: 'vite-endo-plugin',
    apply: 'serve', // Only run in dev mode

    config() {
      return {
        define: {
          // Placeholders - will be overwritten after gateway starts
          'import.meta.env.ENDO_GATEWAY': JSON.stringify(''),
          'import.meta.env.ENDO_AGENT': JSON.stringify(''),
          'import.meta.env.TCP_NETSTRING_PATH': JSON.stringify(tcpNetstringUrl),
          'import.meta.env.LIBP2P_PATH': JSON.stringify(libp2pUrl),
        },
      };
    },

    async configureServer(server) {
      try {
        // Ensure system Endo daemon is running
        await ensureEndoRunning();

        // Start gateway server
        const result = await startGatewayServer(port);
        gatewayAddress = `127.0.0.1:${result.httpPort}`;
        agentId = result.endoId;
        gatewayProcess = result.process;

        console.log(`[Endo Plugin] Gateway ready at ${gatewayAddress}`);
        console.log(`[Endo Plugin] Agent: ${agentId.slice(0, 16)}...`);

        // Update the define values (mutate because we can't reassign readonly)
        Object.assign(server.config.define || {}, {
          'import.meta.env.ENDO_GATEWAY': JSON.stringify(gatewayAddress),
          'import.meta.env.ENDO_AGENT': JSON.stringify(agentId),
        });
      } catch (error) {
        console.error(`[Endo Plugin] Failed to start:`, error);
        throw error;
      }

      // Handle server close - stop gateway server
      server.httpServer?.on('close', () => {
        console.log('[Endo Plugin] Shutting down gateway server...');
        if (gatewayProcess) {
          gatewayProcess.kill('SIGTERM');
        }
      });
    },

    // Provide a way to get info for debugging
    api: {
      getGatewayAddress: () => gatewayAddress,
      getAgentId: () => agentId,
    },
  };
};

export default makeEndoPlugin;
