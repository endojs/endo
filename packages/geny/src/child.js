#!/usr/bin/env node
// @ts-check
/* global process */

/**
 * Child process entry point for geny.
 *
 * Accepts command-line arguments:
 *   --discriminator <string> - Unique identifier for the child
 *   --port <number> - TCP port to listen on
 *   --swissnum <string> - Random swissnum for the control object
 *
 * @module
 */

// Establish a perimeter:
import '@endo/init';

import { E } from '@endo/eventual-send';
import { Far } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';
// eslint-disable-next-line import/no-unresolved -- workspace exports
import { makeClient } from '@endo/ocapn/client/index.js';
// eslint-disable-next-line import/no-unresolved -- workspace exports
import { makeTcpNetLayer } from '@endo/ocapn/netlayers/tcp-test-only.js';

/**
 * @import { PromiseKit } from '@endo/promise-kit'
 */

/**
 * Parses command-line arguments.
 *
 * @param {string[]} args - The command-line arguments
 * @returns {{ discriminator: string, port: number, swissnum: string }}
 */
const parseArgs = args => {
  let discriminator = '';
  let port = 0;
  let swissnum = '';

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--discriminator' && i + 1 < args.length) {
      discriminator = args[i + 1];
      i += 1;
    } else if (arg === '--port' && i + 1 < args.length) {
      port = parseInt(args[i + 1], 10);
      i += 1;
    } else if (arg === '--swissnum' && i + 1 < args.length) {
      swissnum = args[i + 1];
      i += 1;
    }
  }

  if (!discriminator) {
    throw Error('Missing required argument: --discriminator');
  }
  if (!port) {
    throw Error('Missing required argument: --port');
  }
  if (!swissnum) {
    throw Error('Missing required argument: --swissnum');
  }

  return { discriminator, port, swissnum };
};

/**
 * Creates a control object that can be used to control this child process.
 *
 * @param {() => void} doShutdown - Function to call to shut down the child
 * @returns {object} The control object
 */
const makeControlObject = doShutdown => {
  return Far('geny-control', {
    /**
     * Shuts down the child process.
     *
     * @returns {Promise<void>}
     */
    shutdown: async () => {
      // Schedule shutdown after a microtask to allow the response to be sent
      Promise.resolve().then(() => {
        doShutdown();
      });
    },

    /**
     * Evaluates code in a compartment with E and Far exposed.
     *
     * @param {string} code - The code to evaluate
     * @param {Record<string, unknown>} endowments - Endowments to pass to the code
     * @returns {Promise<unknown>} The result of the evaluation
     */
    eval: async (code, endowments) => {
      const compartment = new Compartment({
        E,
        Far,
        endowments: harden(endowments),
      });
      const result = compartment.evaluate(code);
      return result;
    },
  });
};

/**
 * Main entry point for the child process.
 *
 * @returns {Promise<void>}
 */
const main = async () => {
  const { discriminator, port, swissnum } = parseArgs(process.argv.slice(2));

  console.log(`[geny-child:${discriminator}] Starting on port ${port}`);

  const { promise: cancelled, reject: cancel } =
    /** @type {PromiseKit<never>} */ (makePromiseKit());

  const doShutdown = () => {
    console.log(`[geny-child:${discriminator}] Shutting down`);
    cancel(Error('Shutdown requested'));
  };

  // Register the control object
  const controlObject = makeControlObject(doShutdown);
  const swissnumTable = new Map();
  swissnumTable.set(swissnum, controlObject);

  // Create the OCapN client
  const client = makeClient({
    debugLabel: `geny-child:${discriminator}`,
    swissnumTable,
    verbose: false,
  });

  // Create and register the TCP netlayer
  const netlayer = await makeTcpNetLayer({
    client,
    specifiedPort: port,
    specifiedHostname: '127.0.0.1',
    specifiedDesignator: discriminator,
  });
  client.registerNetlayer(netlayer);

  const { hints } = netlayer.location;
  const hostPort =
    hints && typeof hints === 'object'
      ? `${hints.host}:${hints.port}`
      : 'unknown';
  console.log(`[geny-child:${discriminator}] Listening on ${hostPort}`);

  // Signal that we're ready by writing to stdout
  console.log(`READY:${port}`);

  // Wait until cancelled
  try {
    await cancelled;
  } catch {
    // Expected - shutdown was requested
  }

  client.shutdown();
  console.log(`[geny-child:${discriminator}] Exiting`);
  process.exit(0);
};

main().catch(error => {
  console.error('Child process error:', error);
  process.exit(1);
});
