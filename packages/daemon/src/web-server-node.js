import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'url';

/** @import { HttpRespond, HttpConnect, FarContext, EndoBootstrap } from './types.js' */

import * as ws from 'ws';

import { makePromiseKit } from '@endo/promise-kit';
import { makePipe, mapWriter, mapReader } from '@endo/stream';
import { E, Far } from '@endo/far';
import { makeBundle } from '@endo/compartment-mapper/bundle.js';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';

import { makeHttpPowers } from './web-server-node-powers.js';

import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';

const { servePortHttp } = makeHttpPowers({ ws, http });

const { WebSocketServer } = ws;

const GatewayBootstrapInterface = M.interface('GatewayBootstrap', {
  fetch: M.call(M.string()).returns(M.promise()),
});

const read = async location => fs.promises.readFile(fileURLToPath(location));

/**
 * @param {EndoBootstrap} powers
 * @param {FarContext} context
 * @param {{ env?: Record<string, string> }} [options]
 */
export const make = async (powers, context, { env = {} } = {}) => {
  const addrUrl = new URL(`http://${env.ENDO_ADDR || '127.0.0.1:8920'}`);
  const gatewayHost = addrUrl.hostname;
  const gatewayPort = addrUrl.port !== '' ? Number(addrUrl.port) : 8920;
  let script;
  if (env.ENDO_WEB_PAGE_BUNDLE_PATH) {
    script = await fs.promises.readFile(env.ENDO_WEB_PAGE_BUNDLE_PATH, 'utf-8');
  } else {
    script = await makeBundle(
      read,
      new URL('web-page.js', import.meta.url).href,
    );
  }

  const gateway = await E(powers).gateway();

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
   * @param {Promise<void>} closed
   * @param {string} logMessage
   */
  const trackConnection = (closed, logMessage) => {
    connectionClosedPromises.add(closed);
    closed.finally(() => {
      connectionClosedPromises.delete(closed);
      console.log(logMessage);
    });
  };

  /**
   * @param {string} name
   * @param {import('@endo/stream').Writer<Uint8Array>} frameWriter
   * @param {import('@endo/stream').Reader<Uint8Array>} frameReader
   * @param {Promise<never>} sessionCancelled
   * @param {object} [bootstrap]
   */
  const openCapTPSession = (
    name,
    frameWriter,
    frameReader,
    sessionCancelled,
    bootstrap,
  ) => {
    const { value: connectionNumber } = connectionNumbers.next();
    const messageWriter = mapWriter(frameWriter, messageToBytes);
    const messageReader = mapReader(frameReader, bytesToMessage);
    const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
      name,
      messageWriter,
      messageReader,
      sessionCancelled,
      bootstrap,
    );
    const remoteBootstrap = getBootstrap();
    E.sendOnly(remoteBootstrap).ping();
    return { connectionNumber, capTpClosed, remoteBootstrap };
  };

  /**
   * Per-weblet HTTP/WebSocket handlers, keyed by hostname.
   * @type {Map<string, { respond: HttpRespond, connect: HttpConnect }>}
   */
  const webletHandlers = new Map();

  // --- Unified HTTP server ---

  const server = http.createServer();

  server.on('error', error => {
    console.error(error);
  });

  server.on('request', (req, res) => {
    (async () => {
      await null;
      if (req.method === undefined || req.url === undefined) {
        return;
      }

      const { host } = req.headers;
      const hostname = host && new URL(`http://${host}`).hostname;
      const handlers = hostname ? webletHandlers.get(hostname) : undefined;

      if (handlers) {
        // Delegate to weblet HTTP handler
        try {
          const response = await handlers.respond(
            harden({
              method: req.method,
              url: req.url,
              headers: harden(
                /** @type {Record<string, string | Array<string> | undefined>} */ (
                  req.headers
                ),
              ),
            }),
          );
          res.writeHead(response.status, response.headers);
          if (response.content === undefined) {
            res.end();
          } else if (
            typeof response.content === 'string' ||
            response.content instanceof Uint8Array
          ) {
            res.end(response.content);
          } else {
            for await (const chunk of response.content) {
              res.write(chunk);
            }
            res.end();
          }
        } catch (_error) {
          try {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Internal Server Error');
          } catch (error) {
            console.error(error);
          }
        }
      } else {
        // Default: gateway info page
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Endo Gateway');
      }
    })();
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket, req) => {
    const remoteAddress = req.socket.remoteAddress;
    // XXX: When the gateway migrates from CapTP to OCapN with a Noise
    // Protocol network layer, accept connections from non-local remote
    // addresses.
    if (
      remoteAddress !== '127.0.0.1' &&
      remoteAddress !== '::1' &&
      remoteAddress !== '::ffff:127.0.0.1'
    ) {
      console.error(
        `[Gateway] Rejected non-local connection from ${remoteAddress}`,
      );
      socket.close(1008, 'Only local connections allowed');
      return;
    }

    const { host } = req.headers;
    const hostname = host && new URL(`http://${host}`).hostname;
    const handlers = hostname ? webletHandlers.get(hostname) : undefined;

    const { promise: closed, resolve: close, reject: abort } = makePromiseKit();

    closed.finally(() => socket.close());

    const [reader, sink] = makePipe();

    socket.on('message', (bytes, isBinary) => {
      if (!isBinary) {
        abort(new Error('expected binary WebSocket frames'));
        return;
      }
      sink.next(bytes);
    });

    socket.on('close', () => {
      sink.return(undefined);
      close(undefined);
    });

    socket.on('error', error => {
      console.error(`[Gateway] WebSocket error:`, error.message);
      abort(error);
    });

    const writer = harden({
      /** @param {Uint8Array} bytes */
      async next(bytes) {
        socket.send(bytes, { binary: true });
        return harden({ done: false, value: undefined });
      },
      async return() {
        socket.close();
        return harden({ done: true, value: undefined });
      },
      /** @param {Error} error */
      async throw(error) {
        socket.close();
        abort(error);
        return harden({ done: true, value: undefined });
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    });

    if (handlers) {
      // Delegate to weblet WebSocket handler
      handlers.connect(
        harden({
          reader,
          writer,
          closed: closed.then(() => {}),
        }),
        harden({
          method: /** @type {string} */ (req.method),
          url: /** @type {string} */ (req.url),
          headers: req.headers,
        }),
      );
    } else {
      // Gateway CapTP connection
      const clientBootstrap = makeExo(
        'GatewayBootstrap',
        GatewayBootstrapInterface,
        {
          /** @param {string} token */
          async fetch(token) {
            return E(gateway).provide(token);
          },
        },
      );

      const { connectionNumber, capTpClosed } = openCapTPSession(
        'Gateway',
        writer,
        reader,
        serverCancelled,
        clientBootstrap,
      );
      console.log(
        `[Gateway] Connection ${connectionNumber} from ${remoteAddress}`,
      );

      trackConnection(
        Promise.race([closed.then(() => {}), capTpClosed]),
        `[Gateway] Closed connection ${connectionNumber}`,
      );
    }
  });

  // Start the unified server
  /** @type {Promise<string>} */
  const started = new Promise((resolve, reject) => {
    server.listen(gatewayPort, gatewayHost, error => {
      if (error) {
        reject(error);
      } else {
        serverCancelled.catch(() => server.close());
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('expected listener to be assigned a port'));
        } else {
          resolve(`http://${gatewayHost}:${address.port}`);
        }
      }
    });
  });

  started.then(address => {
    console.log(
      `Endo unified server listening on ${address} at ${new Date().toISOString()}`,
    );
  });

  // --- Weblet registration ---

  /**
   * @param {unknown} webletBundle
   * @param {unknown} webletPowers
   * @param {number | undefined} requestedPort
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

    // When a dedicated port is requested, the weblet uses access-token-in-path
    // isolation on its own HTTP server. Otherwise it registers on the unified
    // server with hostname-based isolation.
    const dedicatedPort = requestedPort !== undefined;
    const pathPrefix = dedicatedPort ? `/${accessToken}` : '';

    /** @type {HttpRespond} */
    const respond = async request => {
      if (request.method === 'GET') {
        if (request.url === `${pathPrefix}/`) {
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
        } else if (request.url === `${pathPrefix}/bootstrap.js`) {
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

    /** @type {HttpConnect} */
    const connect = (connection, request) => {
      if (dedicatedPort && request.url !== `/${accessToken}/`) {
        connection.writer.throw(new Error(`Invalid access token.`));
        return;
      }

      (async () => {
        await null;
        const {
          reader: frameReader,
          writer: frameWriter,
          closed: connectionClosed,
        } = connection;

        const {
          connectionNumber,
          capTpClosed,
          remoteBootstrap: webletBootstrap,
        } = openCapTPSession(
          'Endo',
          frameWriter,
          frameReader,
          cancelled,
          undefined, // bootstrap
        );
        console.log(
          `Endo daemon received weblet web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
        );

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

        trackConnection(
          Promise.race([connectionClosed, capTpClosed]),
          `Endo daemon closed weblet web socket connection ${connectionNumber} at ${new Date().toISOString()}`,
        );
      })().catch(exitWithError);
    };

    const stopped = cancelled.catch(() =>
      Promise.all(Array.from(connectionClosedPromises)),
    );

    /** @param {() => Promise<string>} getLocation */
    const makeWebletFar = getLocation =>
      Far('Weblet', { getLocation, stopped: () => stopped });

    if (dedicatedPort) {
      // Dedicated HTTP server on the requested port (legacy path-based isolation)
      const portStarted = servePortHttp({
        port: requestedPort,
        host: '127.0.0.1',
        respond,
        connect,
        cancelled,
      });

      portStarted.then(assignedPort => {
        console.log(
          `Endo daemon listening for weblet HTTP on ${assignedPort} at ${new Date().toISOString()}`,
        );
      });

      return makeWebletFar(async () => {
        const assignedPort = await portStarted;
        return `http://127.0.0.1:${assignedPort}/${accessToken}/`;
      });
    }

    // Register on the unified server.
    // Electron's custom protocol handler sends the bare access token as the
    // Host header, so we key on accessToken directly.
    webletHandlers.set(accessToken, { respond, connect });

    cancelled.catch(() => {
      webletHandlers.delete(accessToken);
    });

    return makeWebletFar(async () => {
      await started;
      return `localhttp://${accessToken}`;
    });
  };

  return Far('WebletService', {
    makeWeblet,
    async getAddress() {
      return started;
    },
  });
};
