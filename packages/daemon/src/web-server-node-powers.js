import { makePromiseKit } from '@endo/promise-kit';
import { makePipe } from '@endo/stream';

/** @import { HttpRespond, HttpConnect } from './types.js' */

const medialIterationResult = harden({ done: false });
const finalIterationResult = harden({ done: false });

/**
 * @param {object} modules
 * @param {typeof import('ws')} modules.ws
 * @param {typeof import('http')} modules.http
 */
export const makeHttpPowers = ({ http, ws }) => {
  // @ts-ignore Not sure why TypeScript gets this wrong.
  const { WebSocketServer } = ws;
  const { createServer } = http;

  /**
   * @param {object} args
   * @param {number} args.port
   * @param {string} args.host
   * @param {HttpRespond} [args.respond]
   * @param {HttpConnect} [args.connect]
   * @param {Promise<never>} args.cancelled
   */
  const servePortHttp = async ({
    port,
    host = '0.0.0.0',
    respond,
    connect,
    cancelled,
  }) => {
    const server = createServer();

    server.on('error', error => {
      console.error(error);
    });

    if (respond) {
      const sendResponse = async (req, res) => {
        const response = await respond(
          harden({
            method: req.method,
            url: req.url,
            // TODO Node.js headers are a far more detailed type.
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
      };

      const tryRespondWithError = res => {
        try {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } catch (error) {
          console.error(error);
        }
      };

      server.on('request', (req, res) => {
        (async () => {
          if (req.method === undefined || req.url === undefined) {
            return;
          }

          try {
            await sendResponse(req, res);
          } catch (_error) {
            // TODO: Log this error locally.
            tryRespondWithError(res);
          }
        })();
      });
    }

    if (connect) {
      const wss = new WebSocketServer({ server });
      wss.on('connection', (socket, req) => {
        if (req.method === undefined) {
          throw Error('expected "method" in request');
        }
        if (req.url === undefined) {
          throw Error('expected "url" in request');
        }

        const {
          promise: closed,
          resolve: close,
          reject: abort,
        } = makePromiseKit();

        closed.finally(() => socket.close());

        const [reader, sink] = makePipe();

        socket.on('message', (bytes, isBinary) => {
          if (!isBinary) {
            abort(new Error('expected binary'));
            return;
          }
          // TODO Ignoring back-pressure signal:
          // Unclear whether WebSocketServer accounts for this possibility.
          sink.next(bytes);
        });
        socket.on('close', () => {
          sink.return(undefined);
          socket.close();
          close(finalIterationResult);
        });

        const writer = {
          async next(bytes) {
            socket.send(bytes, { binary: true });
            return Promise.race([closed, medialIterationResult]);
          },
          async return() {
            socket.close();
            return Promise.race([closed, medialIterationResult]);
          },
          async throw(error) {
            socket.close();
            abort(error);
            return Promise.race([closed, medialIterationResult]);
          },
          [Symbol.asyncIterator]() {
            return this;
          },
        };

        connect(
          harden({
            reader,
            writer,
            closed: closed.then(() => {}),
          }),
          harden({
            method: req.method,
            url: req.url,
            headers: req.headers,
          }),
        );
      });
    }

    return new Promise((resolve, reject) => {
      server.listen(port, host, error => {
        if (error) {
          reject(error);
        } else {
          cancelled.catch(() => server.close());
          const address = server.address();
          if (address === null || typeof address === 'string') {
            reject(new Error('expected listener to be assigned a port'));
          } else {
            resolve(address.port);
          }
        }
      });
    });
  };

  return harden({ servePortHttp });
};
