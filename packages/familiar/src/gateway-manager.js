// @ts-check
/* global process, setTimeout */

import { spawn } from 'child_process';

import { resourcePaths } from './resource-paths.js';

/**
 * @typedef {object} GatewayInfo
 * @property {number} httpPort - The port the gateway HTTP server is listening on
 * @property {string} endoId - The AGENT identifier for the host
 * @property {import('child_process').ChildProcess} process - The gateway child process
 */

/**
 * Start the gateway server as a child process.
 * Parses its stdout JSON output for connection info.
 *
 * @param {object} [options]
 * @param {number} [options.port] - Requested port (0 = host-assigned)
 * @returns {Promise<GatewayInfo>}
 */
const startGateway = (options = {}) => {
  const { port = 0 } = options;

  return new Promise((resolve, reject) => {
    console.log('[🐈‍⬛ Familiar] Starting gateway server...');

    const child = spawn(
      resourcePaths.nodePath,
      [resourcePaths.gatewayServerPath, JSON.stringify({ port })],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let resolved = false;

    child.stdout.on('data', data => {
      stdout += data.toString();

      if (!resolved) {
        const lines = stdout.trim().split('\n');
        for (const line of lines) {
          try {
            const result = JSON.parse(line);
            if (result.httpPort && result.endoId) {
              resolved = true;
              console.log(
                `[🐈‍⬛ Familiar] Gateway ready on port ${result.httpPort}`,
              );
              resolve({
                httpPort: result.httpPort,
                endoId: result.endoId,
                process: child,
              });
              return;
            }
          } catch {
            // Not JSON yet, keep waiting
          }
        }
      }
    });

    child.stderr.on('data', data => {
      process.stderr.write(data);
    });

    child.on('close', code => {
      if (!resolved) {
        reject(new Error(`Gateway server exited with code ${code}`));
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
 * Stop the gateway server process.
 *
 * @param {import('child_process').ChildProcess} gatewayProcess
 */
const stopGateway = gatewayProcess => {
  console.log('[🐈‍⬛ Familiar] Stopping gateway server...');
  gatewayProcess.kill('SIGTERM');
};

export { startGateway, stopGateway };
