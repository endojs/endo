// @ts-check

import { E } from '@endo/far';
import { mapReader, mapWriter } from '@endo/stream';
import { q } from '@endo/errors';
import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';

export const servePrivatePortHttp = (
  requestedWebletPort,
  endoBootstrap,
  { servePortHttp, connectionNumbers, cancelled, exitWithError },
) => {
  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const respond = async request => {
    if (request.method === 'GET') {
      if (request.url === '/') {
        return {
          status: 200,
          headers: { 'Content-Type': 'text/html', Charset: 'utf-8' },
          content: `\
<meta charset="utf-8">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%228%22 font-size=%228%22>🐈‍⬛</text></svg>">
<body>
  <h1>⏳</h1>
  <script src="bootstrap.js"></script>
</body>`,
        };
      } else if (request.url === '/bootstrap.js') {
        // TODO readable mutable file formula (with watcher?)
        // Behold, recursion:
        // eslint-disable-next-line no-use-before-define
        const webPageJs = await E(endoBootstrap).webPageJs();
        return {
          status: 200,
          headers: { 'Content-Type': 'application/javascript' },
          content: webPageJs,
        };
      }
    }
    return {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
      content: `Not found: ${request.method} ${request.url}`,
    };
  };

  const started = servePortHttp({
    port: requestedWebletPort,
    host: '127.0.0.1',
    respond,
    connect(connection, request) {
      // TODO select attenuated bootstrap based on subdomain
      (async () => {
        const assignedHttpPort = await started;
        const {
          reader: frameReader,
          writer: frameWriter,
          closed: connectionClosed,
        } = connection;

        const { value: connectionNumber } = connectionNumbers.next();
        console.log(
          `Endo daemon received local web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
        );

        const messageWriter = mapWriter(frameWriter, messageToBytes);
        const messageReader = mapReader(frameReader, bytesToMessage);

        const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
          'Endo',
          messageWriter,
          messageReader,
          cancelled,
          undefined, // bootstrap
        );

        const webBootstrap = getBootstrap();

        // TODO set up heart monitor
        E.sendOnly(webBootstrap).ping();

        const host = request.headers.host;
        if (host === undefined) {
          throw new Error('Host header required');
        }
        const match =
          /^([0-9a-f]{32})\.endo\.localhost:([1-9][0-9]{0,4})$/.exec(host);
        if (match === null) {
          throw new Error(`Invalid host ${host}`);
        }
        const [_, formulaNumber, portNumber] = match;
        // eslint-disable-next-line no-use-before-define
        if (assignedHttpPort !== +portNumber) {
          console.error(
            'Connected browser misreported port number in host header',
          );
          E(webBootstrap)
            .reject(
              'Your browser misreported your port number in the host header',
            )
            .catch(error => {
              console.error(error);
            });
        } else {
          // eslint-disable-next-line no-use-before-define
          E(endoBootstrap)
            .importAndEndowInWebPage(webBootstrap, formulaNumber)
            .catch(error => {
              E.sendOnly(webBootstrap).reject(error.message);
            })
            .catch(error => {
              console.error(error);
            });
        }

        const closed = Promise.race([connectionClosed, capTpClosed]);
        connectionClosedPromises.add(closed);
        closed.finally(() => {
          connectionClosedPromises.delete(closed);
          console.log(
            `Endo daemon closed local web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
          );
        });
      })().catch(exitWithError);
    },
    cancelled,
  });

  started.then(assignedHttpPort => {
    console.log(
      `Endo daemon listening for HTTP on ${q(
        assignedHttpPort,
      )} ${new Date().toISOString()}`,
    );
  });

  const stopped = cancelled.catch(() =>
    Promise.all(Array.from(connectionClosedPromises)),
  );

  return harden({ started, stopped });
};
