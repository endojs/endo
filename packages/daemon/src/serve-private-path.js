// @ts-check

import { makeNetstringCapTP } from './connection.js';

const { quote: q } = assert;

export const servePrivatePath = (
  sockPath,
  endoBootstrap,
  { servePath, connectionNumbers, cancelled, exitWithError },
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
