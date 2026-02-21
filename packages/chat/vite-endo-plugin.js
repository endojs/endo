// @ts-check
/* global setTimeout, process */

import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

// Path to the monorepo root
const repoRoot = path.resolve(dirname, '../..');

// Path to the TCP netstring network module (file:// URL for the daemon worker)
const tcpNetstringUrl = `file://${path.join(repoRoot, 'packages/daemon/src/networks/tcp-netstring.js')}`;

// Path to the endo CLI in this repo
const endoCliPath = path.join(repoRoot, 'packages/cli/bin/endo.cjs');

// Path to the gateway server script
const gatewayServerPath = path.join(dirname, 'scripts/gateway-server.js');

/**
 * @typedef {object} EndoPluginOptions
 * @property {number} [port] - Requested gateway port (0 = host-assigned)
 */

/**
 * Ensure the system Endo daemon is running using this repo's CLI.
 *
 * @returns {Promise<void>}
 */
const ensureEndoRunning = async () => {
  return new Promise((resolve, reject) => {
    console.log('[Endo Plugin] Ensuring Endo daemon is running...');

    const child = spawn('node', [endoCliPath, 'start'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: repoRoot,
    });

    let stderr = '';
    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (code === 0) {
        console.log('[Endo Plugin] Endo daemon is running');
        resolve();
        return;
      }

      // Code 1 might just mean it's already running, which is fine
      // Check stderr for actual errors
      const shouldResolve =
        stderr.includes('already running') || !stderr.includes('ECONNREFUSED');
      if (shouldResolve) {
        console.log('[Endo Plugin] Endo daemon is running');
        resolve();
        return;
      }

      reject(new Error(`Failed to start Endo daemon: ${stderr}`));
    });

    child.on('error', reject);

    // Timeout after 30 seconds
    setTimeout(() => {
      child.kill();
      reject(new Error('Timeout waiting for Endo daemon to start'));
    }, 30000);
  });
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
 * 3. Injects ENDO_PORT and ENDO_ID as environment variables
 *
 * @param {EndoPluginOptions} [options]
 * @returns {import('vite').Plugin}
 */
export const makeEndoPlugin = (options = {}) => {
  const { port = 0 } = options;

  /** @type {number | undefined} */
  let assignedPort;
  /** @type {string | undefined} */
  let endoId;
  /** @type {import('child_process').ChildProcess | undefined} */
  let gatewayProcess;

  return {
    name: 'vite-endo-plugin',
    apply: 'serve', // Only run in dev mode

    config() {
      return {
        define: {
          // Placeholders - will be overwritten after gateway starts
          'import.meta.env.ENDO_PORT': JSON.stringify(0),
          'import.meta.env.ENDO_ID': JSON.stringify(''),
          'import.meta.env.TCP_NETSTRING_PATH': JSON.stringify(tcpNetstringUrl),
        },
      };
    },

    async configureServer(server) {
      try {
        // Ensure system Endo daemon is running
        await ensureEndoRunning();

        // Start gateway server
        const result = await startGatewayServer(port);
        assignedPort = result.httpPort;
        endoId = result.endoId;
        gatewayProcess = result.process;

        console.log(`[Endo Plugin] Gateway ready on port ${assignedPort}`);
        console.log(`[Endo Plugin] ENDO_ID: ${endoId.slice(0, 16)}...`);

        // Update the define values (mutate because we can't reassign readonly)
        Object.assign(server.config.define || {}, {
          'import.meta.env.ENDO_PORT': JSON.stringify(assignedPort),
          'import.meta.env.ENDO_ID': JSON.stringify(endoId),
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
      getPort: () => assignedPort,
      getEndoId: () => endoId,
    },
  };
};

export default makeEndoPlugin;
