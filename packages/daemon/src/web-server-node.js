import 'ses';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'url';

/** @import { HttpRespond, FarContext } from './types.js' */

// @ts-ignore We cannot use a synthetic default export in practice here (circa Node.js 16)
import * as ws from 'ws';

import { mapWriter, mapReader } from '@endo/stream';
import { E, Far } from '@endo/far';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';

import { q } from '@endo/errors';
import { makeHttpPowers } from './web-server-node-powers.js';

import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';

const { servePortHttp } = makeHttpPowers({ ws, http });

const read = async location => fs.promises.readFile(fileURLToPath(location));

/**
 * @param {ERef<EndoDirectory>} scratch
 * @param {FarContext} context
 */
export const make = async (scratch, context) => {
  const script = await makeBundle(
    read,
    new URL('web-page.js', import.meta.url).href,
  );

  const exitWithError = error => {
    E(context).cancel(error);
  };

  const weblets = new Map();

  const serverCancelled = E(context).whenCancelled();

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const connectWeblet = async (connection, weblet) => {
    await null;
    const {
      reader: frameReader,
      writer: frameWriter,
      closed: connectionClosed,
    } = connection;

    const {
      id: webletId,
      bundle: webletBundle,
      powers: webletPowers,
      cancelled: webletCancelled,
    } = weblet;

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
      webletCancelled,
      undefined, // bootstrap
    );

    const webletBootstrap = getBootstrap();

    // TODO set up heart monitor
    E.sendOnly(webletBootstrap).ping();

    E(webletBootstrap)
      .makeBundle(
        await E(/** @type {any} */ (webletBundle)).json(),
        webletPowers,
      )
      .catch(error => {
        E.sendOnly(webletBootstrap).reject(error.message);
      })
      .catch(error => {
        console.log(error);
      });

    const closed = Promise.race([connectionClosed, capTpClosed]);
    connectionClosedPromises.add(closed);
    closed.finally(() => {
      connectionClosedPromises.delete(closed);
      console.log(
        `Endo daemon closed local web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
      );
    });
  };

  /**
   * @param {unknown} webletBundle
   * @param {unknown} webletPowers
   * @param {number} requestedPort
   * @param {string} webletId
   * @param {Promise<never>} webletCancelled
   */
  const makeWeblet = (
    webletBundle,
    webletPowers,
    requestedPort,
    webletId,
    webletCancelled,
  ) => {
    const accessToken = webletId.slice(0, 32);

    const cancelled = Promise.race([webletCancelled, serverCancelled]);

    const weblet = {
      id: webletId,
      bundle: webletBundle,
      powers: webletPowers,
      cancelled: webletCancelled,
    };

    weblets.set(accessToken, weblet);

    /** @type {HttpRespond} */
    const respond = async request => {
      if (request.method === 'GET') {
        if (request.url === `/${accessToken}/`) {
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Charset': 'utf-8',
              //'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'unsafe-eval' 'unsafe-inline'",
            },
            content: `\
  <meta charset="utf-8">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%228%22 font-size=%228%22>🐈‍⬛</text></svg>">
  <body>
    <h1>⏳</h1>
    <script src="bootstrap.js"></script>
  </body>`,
          };
        } else if (request.url === `/${accessToken}/bootstrap.js`) {
          // TODO readable mutable file formula (with watcher?)
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          return {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' },
            content: script,
          };
        }
      }
      return {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
        content: `Not found: ${request.method} ${request.url}`,
      };
    };

    const connect = (connection, request) => {
      console.log('Endo received request', request);
      if (request.url !== `/${accessToken}/`) {
        connection.writer.throw(new Error(`Invalid access token.`));
        return;
      }

      return connectWeblet(connection, weblet).catch(exitWithError);
    };

    const started =
      requestedPort > 0
        ? servePortHttp({
            port: requestedPort,
            host: '127.0.0.1',
            respond,
            connect,
            cancelled,
          }).then(assignedPort => {
            console.log(
              `Endo daemon listening for HTTP on ${q(
                assignedPort,
              )} ${new Date().toISOString()}`,
            );
            return assignedPort;
          })
        : Promise.resolve(undefined);

    const stopped = cancelled.catch(() => {
      weblets.delete(webletId);
      return Promise.all(Array.from(connectionClosedPromises));
    });

    return Far('Weblet', {
      async getLocation() {
        const assignedPort = await started;
        if (assignedPort == undefined) {
          return `localhttp://${accessToken}`;
        }
        return `http://127.0.0.1:${assignedPort}/${accessToken}/`;
      },
      stopped: () => stopped,
    });
  };

  const makeWebletVirtualHost = () => {
    /** @type {HttpRespond} */
    const respond = async request => {
      console.log('Endo connection received for host', request.headers.host);
      if (request.method === 'GET') {
        if (request.url === '/') {
          return {
            status: 200,
            headers: {
              'Content-Type': 'text/html',
              'Charset': 'utf-8',
              //'Content-Security-Policy': "default-src 'self'; img-src 'self'; script-src 'unsafe-eval' 'unsafe-inline'",
            },
            content: `\
  <meta charset="utf-8">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 10 10%22><text y=%228%22 font-size=%228%22>🐈‍⬛</text></svg>">
  <body>
    <h1>⏳</h1>
    <script src="bootstrap.js"></script>
  </body>`,
          };
        } else if (request.url === `/bootstrap.js`) {
          // TODO readable mutable file formula (with watcher?)
          // Behold, recursion:
          // eslint-disable-next-line no-use-before-define
          return {
            status: 200,
            headers: { 'Content-Type': 'application/javascript' },
            content: script,
          };
        }
      }
      return {
        status: 404,
        headers: { 'Content-Type': 'text/plain' },
        content: `Not found: ${request.method} ${request.url}`,
      };
    };

    const connect = (connection, request) => {
      const { host } = request.headers;
      if (!host.startsWith('localhttp://')) {
        console.error(`Endo weblet server: Invalid weblet host: ${host}`);
        console.writer.throw(new Error(`Invalid weblet host: ${host}`));
        return;
      }
      const accessToken = host.slice('localhttp://'.length);

      const weblet = weblets.get(accessToken);

      if (weblet === undefined) {
        console.error(`Endo weblet server: no such weblet ${accessToken}`);
        connection.writer.throw(new Error(`No such Weblet ${accessToken}`));
        return;
      }
      console.log(`Endo connects weblet ${weblet.id} on port 8920`);

      connection.closed.catch(() => {
        console.log(`Endo disconnects weblet ${weblet.id} on port 8920`);
      });

      return connectWeblet(connection, weblet).catch(exitWithError);
    };

    const started = servePortHttp({
      port: 8920,
      host: '127.0.0.1',
      respond,
      connect,
      cancelled: serverCancelled,
    });

    started.then(assignedPort => {
      console.log(
        `Endo daemon listening for HTTP on ${q(
          assignedPort,
        )} ${new Date().toISOString()}`,
      );
    });

    const stopped = serverCancelled.catch(() =>
      Promise.all(Array.from(connectionClosedPromises)),
    );
  };

  makeWebletVirtualHost();

  const list = () => {
    return [...weblets.keys()];
  };

  return Far('WebletService', { makeWeblet, list });
};
