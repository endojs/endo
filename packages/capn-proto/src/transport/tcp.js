// @ts-check
/**
 * TCP transport for `@endo/capn-proto`.
 *
 * Wraps `node:net` sockets so two peers can speak Cap'n Proto RPC over
 * TCP — the standard transport the upstream C++ implementation
 * (`capnp::EzRpcServer` / `EzRpcClient` and the calculator example) uses.
 * Wire format: Cap'n Proto Standard Stream Encoding (segment table +
 * segments back-to-back), one framed message per `send`. Concatenated
 * messages on the wire are split apart by `makeFramedStreamParser`.
 *
 *   const peer = await connectTcp({
 *     host: '127.0.0.1',
 *     port: 9000,
 *     interfaceRegistry,
 *   });
 *   const remote = peer.capnp.getBootstrap();
 *   const result = await E(remote).ping({ msg: 'hello' });
 *
 *   const server = serveTcp({
 *     host: '127.0.0.1',
 *     port: 9000,
 *     bootstrap: myEcho,
 *     interfaceRegistry,
 *   });
 *
 * The bound socket is exposed on each peer so callers can attach their
 * own listeners (e.g. for end / error / timeout) without forking the
 * module.
 */

import { Buffer } from 'node:buffer';
import { createConnection, createServer } from 'node:net';

import { makeCapnp } from '../rpc-system.js';
import { makeFramedStreamParser } from '../wire/streaming.js';

// Note: the records returned by `wrapSocket` / `serveTcp` are deliberately
// NOT hardened. They expose live `node:net` Socket / Server handles, which
// have mutable internal fields (Server._connections, Socket._events, etc.)
// that node mutates as connections come and go. `harden()` deep-walks
// records and freezes those fields, which breaks the runtime.

/**
 * Adapt an already-connected duplex byte stream (anything quacking like a
 * `net.Socket`: `write`, `end`, `'data'`, `'end'`, `'error'`) to a
 * `makeCapnp` instance. Used by both `connectTcp` and `serveTcp`. The
 * `send` field of `makeCapnp` is supplied internally; callers pass only
 * the higher-level fields (bootstrap, interfaceRegistry, capHomes,
 * onAbort).
 *
 * @param {any} socket
 * @param {{
 *   bootstrap?: unknown,
 *   interfaceRegistry?: import('../interfaces.js').InterfaceRegistry,
 *   capHomes?: ReturnType<typeof import('../cap-home-registry.js').makeCapHomeRegistry>,
 *   onAbort?: (reason: unknown) => void,
 * }} [cfg]
 */
const wrapSocket = (socket, cfg) => {
  let connected = true;

  const capnp = makeCapnp({
    ...cfg,
    send: framed => {
      if (!connected) return;
      // node:net wants Buffer; the framed message arrives as ArrayBuffer.
      socket.write(Buffer.from(framed));
    },
  });
  if (cfg && cfg.onAbort) capnp.setOnAbort(cfg.onAbort);

  const abortConnection = reason => {
    if (!connected) return;
    connected = false;
    try {
      socket.end();
    } catch (_e) {
      // Already closed; ignore.
    }
    capnp.abort(reason);
  };

  const parser = makeFramedStreamParser({
    onMessage: framed => {
      if (!connected) return;
      capnp.dispatch(framed);
    },
  });

  socket.on('data', chunk => {
    try {
      parser.push(chunk);
    } catch (e) {
      abortConnection(e);
    }
  });
  socket.on('end', () => abortConnection(Error('peer closed connection')));
  socket.on('error', err => abortConnection(err));

  return {
    capnp,
    socket,
    close: () => {
      abortConnection(Error('local close'));
    },
  };
};

/**
 * Open a TCP connection to a Cap'n Proto peer. Returns a peer object
 * holding the `makeCapnp` instance, the underlying socket, and a
 * `close()` helper. The returned promise resolves once the socket is
 * actually `connect`ed; the bootstrap question won't go out before that.
 *
 * @param {object} cfg
 * @param {string} cfg.host
 * @param {number} cfg.port
 * @param {unknown} [cfg.bootstrap]
 * @param {import('../interfaces.js').InterfaceRegistry} [cfg.interfaceRegistry]
 * @param {ReturnType<typeof import('../cap-home-registry.js').makeCapHomeRegistry>} [cfg.capHomes]
 * @param {(reason: unknown) => void} [cfg.onAbort]
 */
export const connectTcp = async ({ host, port, ...cfg }) => {
  const socket = createConnection({ host, port });
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  return wrapSocket(socket, cfg);
};

/**
 * Listen on a TCP port for incoming Cap'n Proto peers. Each accepted
 * connection becomes its own `makeCapnp` instance with the supplied
 * bootstrap.
 *
 * Returns the underlying `net.Server` plus a `close()` helper that stops
 * accepting and closes any open peer connections.
 *
 * @param {object} cfg
 * @param {number} cfg.port
 * @param {string} [cfg.host]
 * @param {(peer: ReturnType<typeof wrapSocket>) => void} [cfg.onConnect]
 *   Called with each accepted peer; lets callers stash references for
 *   shutdown bookkeeping.
 * @param {unknown} [cfg.bootstrap]
 * @param {import('../interfaces.js').InterfaceRegistry} [cfg.interfaceRegistry]
 * @param {ReturnType<typeof import('../cap-home-registry.js').makeCapHomeRegistry>} [cfg.capHomes]
 */
export const serveTcp = async ({
  port,
  host = '127.0.0.1',
  onConnect,
  ...cfg
}) => {
  /** @type {Set<ReturnType<typeof wrapSocket>>} */
  const peers = new Set();
  const server = createServer(socket => {
    const peer = wrapSocket(socket, cfg);
    peers.add(peer);
    socket.once('close', () => peers.delete(peer));
    if (onConnect) onConnect(peer);
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
    server.listen(port, host);
  });
  const { port: boundPort } = /** @type {any} */ (server.address());
  return {
    server,
    port: boundPort,
    close: () =>
      new Promise(resolve => {
        for (const peer of peers) peer.close();
        peers.clear();
        server.close(() => resolve(undefined));
      }),
  };
};
