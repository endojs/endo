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
 * @param {unknown} _powers
 * @param {FarContext} context
 */
export const make = async (_powers, context) => {
  const script = await makeBundle(
    read,
    new URL('web-page.js', import.meta.url).href,
  );

  const exitWithError = error => {
    E(context).cancel(error);
  };

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

    /** @type {HttpRespond} */
    const respond = async request => {
      if (request.method === 'GET') {
        if (request.url === `/${accessToken}/`) {
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
      if (request.url !== `/${accessToken}/`) {
        connection.writer.throw(Error(`Invalid access token.`));
        return;
      }

      (async () => {
        await null;
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
      })().catch(exitWithError);
    };

    const started = servePortHttp({
      port: requestedPort,
      host: '127.0.0.1',
      respond,
      connect,
      cancelled,
    });

    started.then(assignedPort => {
      console.log(
        `Endo daemon listening for HTTP on ${q(
          assignedPort,
        )} ${new Date().toISOString()}`,
      );
    });

    const stopped = cancelled.catch(() =>
      Promise.all(Array.from(connectionClosedPromises)),
    );

    return Far('Weblet', {
      async getLocation() {
        const assignedPort = await started;
        return `http://127.0.0.1:${assignedPort}/${accessToken}/`;
      },
      stopped: () => stopped,
    });
  };

  return Far('WebletService', { makeWeblet });
};
