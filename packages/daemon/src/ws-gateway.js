// @ts-check

import http from 'node:http';
import { WebSocketServer } from 'ws';

import { E } from '@endo/eventual-send';
import { makeExo } from '@endo/exo';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';
import { makePipe, mapWriter, mapReader } from '@endo/stream';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

/** @import { FarRef } from '@endo/eventual-send' */
/** @import { EndoBootstrap } from './types.js' */

import {
  makeMessageCapTP,
  messageToBytes,
  bytesToMessage,
} from './connection.js';

const GatewayBootstrapInterface = M.interface('GatewayBootstrap', {
  fetch: M.call(M.string()).returns(M.promise()),
});
harden(GatewayBootstrapInterface);

/**
 * Per-key rate limiter. Each failed attempt delays the next allowed
 * attempt by `penaltyMs`.
 *
 * @param {number} penaltyMs
 */
const makeRateLimiter = penaltyMs => {
  /** @type {Map<string, number>} */
  const nextAllowed = new Map();
  const collectionThreshold = penaltyMs * 10;

  return harden({
    /**
     * @param {string} key
     * @returns {number} 0 if allowed, otherwise ms until allowed
     */
    check: key => {
      const now = Date.now();
      const deadline = nextAllowed.get(key);
      if (deadline !== undefined && now < deadline) {
        return deadline - now;
      }
      for (const [k, t] of nextAllowed) {
        if (now >= t + collectionThreshold) {
          nextAllowed.delete(k);
        }
      }
      return 0;
    },
    /** @param {string} key */
    recordFailure: key => {
      const now = Date.now();
      const current = nextAllowed.get(key);
      const base = current !== undefined && current > now ? current : now;
      nextAllowed.set(key, base + penaltyMs);
    },
  });
};
harden(makeRateLimiter);

/**
 * Start a WebSocket gateway that allows the Chat app (and other
 * browser clients) to reach the daemon via CapTP.
 *
 * @param {object} opts
 * @param {FarRef<EndoBootstrap> | EndoBootstrap} opts.endoBootstrap
 * @param {string} opts.host
 * @param {number} opts.port
 * @param {Promise<never>} opts.cancelled
 * @param {(err: Error, errorId?: string) => void} [opts.marshalSaveError] -
 *   Outbound-error hook the daemon installs so a browser-facing errorId (minted
 *   by this gateway's CapTP when it serializes an error out to the Chat client)
 *   is aliased onto the worker-side trace record. Without it the client's
 *   `diagnostics().traces().lookup(errorId)` misses and the error surfaces as a
 *   bare message with no stack or worker chip (the private-path CLI already
 *   passes the same hook).
 * @returns {{ started: Promise<string>, stopped: Promise<void> }}
 */
export const startWsGateway = ({
  endoBootstrap,
  host,
  port,
  cancelled,
  marshalSaveError = undefined,
}) => {
  const fetchLimiter = makeRateLimiter(1000);
  const gatewayP = E(endoBootstrap).gateway();

  /** @type {Set<Promise<void>>} */
  const connectionClosedPromises = new Set();

  const connectionNumbers = (function* generateNumbers() {
    let n = 0;
    for (;;) {
      yield n;
      n += 1;
    }
  })();

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || '/', 'http://gateway.invalid');
    const contentMatch = /^\/content\/([0-9a-f]{64})$/.exec(
      requestUrl.pathname,
    );
    if (request.method === 'GET' && contentMatch !== null) {
      const kind =
        requestUrl.searchParams.get('kind') === 'tree' ? 'tree' : 'blob';
      try {
        const readerP =
          kind === 'tree'
            ? E(gatewayP).provideTree(contentMatch[1])
            : E(gatewayP).provideBlob(contentMatch[1]);
        const reader = await readerP;
        response.writeHead(200, {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, immutable, max-age=31536000',
        });
        for await (const chunk of iterateBytesReader(reader)) {
          if (!response.write(chunk)) {
            await new Promise(resolve => response.once('drain', resolve));
          }
        }
        response.end();
      } catch (_error) {
        // Do not distinguish an absent content hash from a malformed stored
        // tree. The plane is advisory and an untrusted caller learns no local
        // store details from its failure.
        response.writeHead(404, { 'Content-Type': 'text/plain' });
        response.end('Content not found');
      }
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.end('Endo Gateway');
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket, req) => {
    const remoteAddress = req.socket.remoteAddress || '';

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

    const clientBootstrap = makeExo(
      'GatewayBootstrap',
      GatewayBootstrapInterface,
      /** @type {any} */ ({
        /** @param {string} token */
        async fetch(token) {
          const addr = remoteAddress;
          const retryIn = fetchLimiter.check(addr);
          if (retryIn > 0) {
            throw new Error(`Rate limit exceeded, try in ${retryIn}ms`);
          }
          try {
            return await E(gatewayP).provide(token);
          } catch (e) {
            fetchLimiter.recordFailure(addr);
            throw e;
          }
        },
      }),
    );

    const { value: connectionNumber } = connectionNumbers.next();
    const messageWriter = mapWriter(writer, messageToBytes);
    const messageReader = mapReader(reader, bytesToMessage);
    const { closed: capTpClosed, getBootstrap } = makeMessageCapTP(
      'Gateway',
      messageWriter,
      messageReader,
      cancelled,
      clientBootstrap,
      { marshalSaveError },
    );
    const remoteBootstrap = getBootstrap();
    E.sendOnly(remoteBootstrap).ping();

    console.log(
      `[Gateway] Connection ${connectionNumber} from ${remoteAddress}`,
    );

    const connectionClosed = Promise.race([closed.then(() => {}), capTpClosed]);
    connectionClosedPromises.add(connectionClosed);
    connectionClosed.finally(() => {
      connectionClosedPromises.delete(connectionClosed);
      console.log(`[Gateway] Closed connection ${connectionNumber}`);
    });
  });

  /** @type {import('@endo/promise-kit').PromiseKit<string>} */
  const {
    promise: started,
    resolve: resolveStarted,
    reject: rejectStarted,
  } = makePromiseKit();

  server.on('error', rejectStarted);
  server.listen(port, host, () => {
    const address = server.address();
    if (address === null || typeof address === 'string') {
      rejectStarted(new Error('expected listener to be assigned a port'));
    } else {
      const addr = `http://${host}:${address.port}`;
      console.log(`Endo gateway listening on ${addr}`);
      resolveStarted(addr);
    }
  });

  cancelled.catch(() => {
    for (const client of wss.clients) {
      client.close();
    }
    wss.close();
    server.close();
  });

  const stopped = cancelled
    .catch(() => Promise.all(Array.from(connectionClosedPromises)))
    .then(() => {});

  return { started, stopped };
};
harden(startWsGateway);
