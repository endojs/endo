// @ts-check
/* global process */

/**
 * Geny host for spawning and managing OCapN child processes.
 *
 * @module
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';

import { E } from '@endo/eventual-send';
import { makePromiseKit } from '@endo/promise-kit';
// eslint-disable-next-line import/no-unresolved -- workspace exports
import { makeClient } from '@endo/ocapn/client/index.js';
// eslint-disable-next-line import/no-unresolved -- workspace exports
import { makeTcpNetLayer } from '@endo/ocapn/netlayers/tcp-test-only.js';
// eslint-disable-next-line import/no-unresolved -- workspace exports
import { encodeSwissnum } from '@endo/ocapn/client/util.js';

/**
 * @import { ChildProcess } from 'child_process'
 */

/**
 * @typedef {object} OcapnLocation
 * @property {'ocapn-peer'} type
 * @property {string} transport
 * @property {string} designator
 * @property {{ host: string, port: string }} hints
 */

/**
 * @typedef {object} GenyChild
 * @property {string} discriminator - The unique identifier for the child
 * @property {object} control - The control object for the child
 * @property {() => Promise<void>} control.shutdown - Shuts down the child
 * @property {(code: string, endowments: Record<string, unknown>) => Promise<unknown>} control.eval - Evaluates code
 * @property {ChildProcess} process - The underlying child process
 * @property {OcapnLocation} location - The OCapN location of the child
 * @property {object} session - The OCapN session with the child
 */

/**
 * @typedef {object} GenyHost
 * @property {(options?: { discriminator?: string }) => Promise<GenyChild>} spawn - Spawns a new child
 * @property {() => void} shutdown - Shuts down the host and all children
 * @property {object} client - The OCapN client
 * @property {object} netlayer - The TCP netlayer
 */

/**
 * Generates a random hex string of the specified length.
 *
 * @param {number} length - The number of bytes (result will be 2x this in hex chars)
 * @returns {string}
 */
const randomHex = (length = 16) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Finds a free port by binding to port 0 and returning the assigned port.
 *
 * @returns {Promise<number>}
 */
const findFreePort = async () => {
  const { createServer } = await import('net');
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (typeof address === 'object' && address !== null) {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        reject(Error('Failed to get port'));
      }
    });
    server.on('error', reject);
  });
};

/**
 * Creates a geny host that can spawn OCapN child processes.
 *
 * @param {object} [options]
 * @param {string} [options.debugLabel] - Debug label for the host
 * @param {boolean} [options.verbose] - Whether to enable verbose logging
 * @returns {Promise<GenyHost>}
 */
export const makeGenyHost = async ({
  debugLabel = 'geny-host',
  verbose = false,
} = {}) => {
  // Create the OCapN client for the host
  const client = makeClient({
    debugLabel,
    verbose,
  });

  // Create and register the TCP netlayer
  const netlayer = await makeTcpNetLayer({
    client,
    specifiedHostname: '127.0.0.1',
    specifiedDesignator: debugLabel,
  });
  client.registerNetlayer(netlayer);

  /** @type {Map<string, GenyChild>} */
  const children = new Map();

  // Path to the child script
  const thisFile = fileURLToPath(import.meta.url);
  const childScriptPath = path.join(path.dirname(thisFile), 'child.js');

  /**
   * Spawns a new child process.
   *
   * @param {object} [options]
   * @param {string} [options.discriminator] - Unique identifier for the child
   * @returns {Promise<GenyChild>}
   */
  const spawnChild = async ({ discriminator = randomHex(8) } = {}) => {
    const port = await findFreePort();
    const swissnum = randomHex(32);

    const childProcess = spawn(
      process.execPath,
      [
        childScriptPath,
        '--discriminator',
        discriminator,
        '--port',
        String(port),
        '--swissnum',
        swissnum,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
      },
    );

    const {
      promise: readyPromise,
      resolve: readyResolve,
      reject: readyReject,
    } = /** @type {import('@endo/promise-kit').PromiseKit<number>} */ (
      makePromiseKit()
    );

    let stderrOutput = '';

    childProcess.stdout?.on('data', data => {
      const output = data.toString();
      if (verbose) {
        console.log(`[${discriminator}:stdout]`, output.trim());
      }
      // Check for the READY signal
      const match = output.match(/READY:(\d+)/);
      if (match) {
        readyResolve(parseInt(match[1], 10));
      }
    });

    childProcess.stderr?.on('data', data => {
      stderrOutput += data.toString();
      if (verbose) {
        console.error(`[${discriminator}:stderr]`, data.toString().trim());
      }
    });

    childProcess.on('error', error => {
      readyReject(error);
    });

    childProcess.on('exit', (code, signal) => {
      if (verbose) {
        console.log(
          `[${discriminator}] Exited with code ${code}, signal ${signal}`,
        );
      }
      children.delete(discriminator);
      if (code !== 0 && code !== null) {
        readyReject(Error(`Child exited with code ${code}: ${stderrOutput}`));
      }
    });

    // Wait for the child to be ready
    const actualPort = await readyPromise;

    // Create the location for the child
    /** @type {OcapnLocation} */
    const childLocation = {
      type: 'ocapn-peer',
      transport: 'tcp-testing-only',
      designator: discriminator,
      hints: {
        host: '127.0.0.1',
        port: String(actualPort),
      },
    };

    // Connect to the child
    const session = await client.provideSession(childLocation);

    // Get the control object from the child
    const bootstrap = session.ocapn.getRemoteBootstrap();
    const control = await E(bootstrap).fetch(encodeSwissnum(swissnum));

    /** @type {GenyChild} */
    // Note: Not hardening because childProcess contains non-hardenable Node.js internals
    const child = {
      discriminator,
      control,
      process: childProcess,
      location: childLocation,
      session,
    };

    children.set(discriminator, child);

    return child;
  };

  /**
   * Shuts down the host and all children.
   */
  const shutdown = () => {
    for (const child of children.values()) {
      try {
        child.process.kill('SIGTERM');
      } catch {
        // Ignore errors when killing
      }
    }
    children.clear();
    client.shutdown();
  };

  /** @type {GenyHost} */
  const host = harden({
    spawn: spawnChild,
    shutdown,
    client,
    netlayer,
  });

  return host;
};
