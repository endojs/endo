// @ts-check
/* global globalThis */

/**
 * @typedef {import('../types.js').ByteStream} ByteStream
 * @typedef {import('../types.js').OcapnNoiseTransport} OcapnNoiseTransport
 * @typedef {import('../types.js').TransportListener} TransportListener
 */
/**
 * @template T
 * @typedef {import('@endo/stream').Reader<T>} Reader
 */
/**
 * @template T
 * @typedef {import('@endo/stream').Writer<T>} Writer
 */

import harden from '@endo/harden';
import { makeQueue } from '@endo/stream';

/**
 * Adapt a `WebSocket`-shaped object (browser `WebSocket`, Node `ws`
 * instance) into an `@endo/stream` `{ reader, writer }` byte-stream.
 * Each binary WebSocket message becomes one `Uint8Array` chunk; the
 * network layer supplies its own framing.
 *
 * @param {any} ws
 * @returns {ByteStream}
 */
const adaptWebSocket = ws => {
  if ('binaryType' in ws) ws.binaryType = 'arraybuffer';

  /** @type {import('@endo/stream').AsyncQueue<IteratorResult<Uint8Array, undefined>>} */
  const incoming = makeQueue();
  let closed = false;

  ws.onmessage = /** @param {{ data: any }} ev */ ev => {
    if (closed) return;
    /** @type {Uint8Array} */
    let bytes;
    if (ev.data instanceof ArrayBuffer) {
      bytes = new Uint8Array(ev.data);
    } else if (ev.data instanceof Uint8Array) {
      bytes = ev.data;
    } else if (ev.data && typeof ev.data === 'object' && 'buffer' in ev.data) {
      bytes = new Uint8Array(
        ev.data.buffer,
        ev.data.byteOffset,
        ev.data.byteLength,
      );
    } else {
      // Reject any non-binary frame: the OCapN-Noise wire is exclusively
      // ciphertext blobs. Silently dropping a text frame would leave a
      // pending `reader.next()` call hanging until the socket eventually
      // closes; surfacing it as a protocol error fails fast.
      closed = true;
      const err = Error(
        'ocapn-noise ws transport: received non-binary message',
      );
      incoming.put(harden(Promise.reject(err)));
      try {
        ws.close();
      } catch (_e) {
        // ignore
      }
      return;
    }
    incoming.put(harden({ done: false, value: bytes }));
  };
  ws.onclose = () => {
    closed = true;
    incoming.put(harden({ done: true, value: undefined }));
  };
  // Route mid-session errors into the incoming queue so pending
  // `reader.next()` promises reject with the actual error rather than
  // silently observing `{done: true}` via the subsequent `close`.
  ws.onerror = /** @param {any} ev */ ev => {
    if (closed) return;
    closed = true;
    const err =
      ev && ev.error
        ? ev.error
        : Error('ocapn-noise ws transport: connection errored');
    incoming.put(harden(Promise.reject(err)));
  };

  /** @type {Reader<Uint8Array>} */
  const reader = harden({
    next: () => incoming.get(),
    return: async () => {
      if (!closed) ws.close();
      return harden({ done: true, value: undefined });
    },
    throw: async err => {
      if (!closed) ws.close();
      throw err;
    },
    [Symbol.asyncIterator]() {
      return reader;
    },
  });

  /** @type {Writer<Uint8Array>} */
  const writer = harden({
    next: async value => {
      if (!closed) ws.send(value);
      return harden({ done: false, value: undefined });
    },
    return: async () => {
      if (!closed) ws.close();
      return harden({ done: true, value: undefined });
    },
    throw: async err => {
      if (!closed) ws.close();
      throw err;
    },
    [Symbol.asyncIterator]() {
      return writer;
    },
  });

  return harden({ reader, writer });
};

/**
 * WebSocket byte-stream transport. Uses the standard `WebSocket` client
 * constructor for outgoing connections; for listening, supply a
 * `WebSocketServer` constructor (e.g. `import { WebSocketServer } from 'ws'`).
 *
 * @param {object} [options]
 * @param {typeof globalThis.WebSocket} [options.WebSocket]
 * @param {{ new (options: { port?: number, host?: string }): any } | undefined} [options.WebSocketServer]
 * @param {number} [options.port]
 * @param {string} [options.host]
 * @returns {OcapnNoiseTransport}
 */
export const makeWebSocketTransport = ({
  WebSocket = /** @type {any} */ (globalThis).WebSocket,
  WebSocketServer,
  port = 0,
  host = '127.0.0.1',
} = {}) => {
  if (!WebSocket) {
    throw Error('makeWebSocketTransport: no WebSocket constructor available');
  }

  /** @type {any} */
  let server;

  /**
   * Substitute a routable address when the listener was bound to a
   * wildcard host. The hint is what we advertise to peers; `0.0.0.0` /
   * `::` / unspecified addresses are not connect targets.
   *
   * @param {string} addr
   */
  const advertisedHost = addr => {
    if (addr === '0.0.0.0' || addr === '::' || addr === '::ffff:0.0.0.0') {
      return '127.0.0.1';
    }
    return addr;
  };

  /** @type {OcapnNoiseTransport['listen']} */
  const listen = WebSocketServer
    ? async handler => {
        if (server) {
          throw Error('ocapn-noise ws transport: listen called more than once');
        }
        server = new WebSocketServer({ port, host });
        await new Promise(resolve => {
          server.on('listening', () => resolve(undefined));
        });
        server.on(
          'connection',
          /** @param {any} ws */ ws => {
            handler(adaptWebSocket(ws));
          },
        );
        const addr = server.address();
        /** @type {TransportListener} */
        const listener = harden({
          hints: { url: `ws://${advertisedHost(addr.address)}:${addr.port}` },
          close: () => {
            try {
              server.close();
            } finally {
              server = undefined;
            }
          },
        });
        return listener;
      }
    : undefined;

  /** @type {OcapnNoiseTransport} */
  const transport = harden({
    scheme: 'ws',
    connect: async hints => {
      const url = hints.url;
      if (!url) throw Error(`ws transport: missing 'url' hint`);
      const ws = new WebSocket(url);
      try {
        await new Promise((resolve, reject) => {
          ws.onopen = () => resolve(undefined);
          ws.onerror = /** @param {any} ev */ ev => reject(ev);
        });
      } catch (err) {
        // Drop the half-open WebSocket so its underlying socket and
        // event-loop refs become collectible immediately.
        try {
          ws.close();
        } catch (_e) {
          // ignore
        }
        throw err;
      }
      return adaptWebSocket(ws);
    },
    listen,
    shutdown: () => {
      if (server) server.close();
      server = undefined;
    },
  });
  return transport;
};
