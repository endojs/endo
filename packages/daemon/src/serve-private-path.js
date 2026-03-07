// @ts-check

import harden from '@endo/harden';
import { q } from '@endo/errors';
import { makeNetstringCapTP } from './connection.js';

/** @import { CapTpConnectionRegistrar } from './types.js' */

/**
 * @param {string} sockPath
 * @param {import('@endo/far').FarRef<unknown>} endoBootstrap
 * @param {object} opts
 * @param {Function} opts.servePath
 * @param {Iterator<number>} opts.connectionNumbers
 * @param {Promise<never>} opts.cancelled
 * @param {(error: Error) => void} opts.exitWithError
 * @param {CapTpConnectionRegistrar} [opts.capTpConnectionRegistrar]
 */
export const servePrivatePath = (
  sockPath,
  endoBootstrap,
  {
    servePath,
    connectionNumbers,
    cancelled,
    exitWithError,
    capTpConnectionRegistrar = undefined,
  },
) => {
  const connectionsP = servePath({ path: sockPath, cancelled });

  const started = (async () => {
    await connectionsP;
    // Resolve a promise in the Endo CLI through the IPC channel:
    console.log(
      `Endo daemon listening for private CapTP on ${q(
        sockPath,
      )} ${new Date().toISOString()}`,
    );
  })();

  const stopped = (async () => {
    /** @type {Set<Promise<void>>} */
    const connectionClosedPromises = new Set();

    const connections = await connectionsP;

    for await (const {
      reader,
      writer,
      closed: connectionClosed,
    } of connections) {
      (async () => {
        const { value: connectionNumber } = connectionNumbers.next();
        console.log(
          `Endo daemon received domain connection ${connectionNumber} at ${new Date().toISOString()}`,
        );

        const { closed: capTpClosed } = makeNetstringCapTP(
          'Endo',
          writer,
          reader,
          cancelled,
          endoBootstrap,
          undefined,
          capTpConnectionRegistrar,
        );

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          console.log(
            `Endo daemon closed domain connection ${connectionNumber} at ${new Date().toISOString()}`,
          );
        });
      })().catch(exitWithError);
    }

    await Promise.all(Array.from(connectionClosedPromises));
  })();

  return harden({ started, stopped });
};
