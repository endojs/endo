// @ts-check

/**
 * @typedef {import('../types.js').ByteStream} ByteStream
 * @typedef {import('../types.js').OcapnNoiseTransport} OcapnNoiseTransport
 * @typedef {import('../types.js').TransportListener} TransportListener
 */

import net from 'node:net';
import harden from '@endo/harden';
import { makeNodeReader } from '@endo/stream-node/reader.js';
import { makeNodeWriter } from '@endo/stream-node/writer.js';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

const { isNaN } = Number;

/**
 * Hard cap on netstring frame length. Sized to the largest plausible
 * single Noise/OCapN message (Noise's 65535-byte ciphertext + auth tag
 * + a small framing header). Keeps a hostile peer who sends
 * `999999999:` from causing a ~1 GiB allocation in the netstring
 * reader.
 */
const MAX_FRAME_LENGTH = 65_551;

/**
 * TCP byte-stream transport.
 *
 * `framing` controls how messages are delimited on the wire:
 *
 * - `'netstring'` (default): every `writer.next(bytes)` emits one
 *   `@endo/netstring`-framed message and every `reader.next()` yields
 *   one whole message, regardless of how the kernel chunks the wire
 *   bytes. This is what OCapN-Noise needs once its own handshake is
 *   complete and session messages start flowing.
 *
 * - `'none'`: raw bytes in, raw bytes out. Each `reader.next()` value
 *   is whatever the kernel happened to deliver (possibly a fragment,
 *   possibly multiple messages concatenated). This mode exists to let
 *   us interoperate with peers that do their own framing (e.g. the
 *   OCapN Python reference suite while it settles). Consumers of this
 *   mode are responsible for their own message boundaries. The
 *   OCapN-Noise network is **not** such a consumer: its handshake and
 *   per-session messages assume one `reader.next()` yields exactly one
 *   message. Do not register a `framing: 'none'` transport with
 *   `makeOcapnNoiseNetwork`; use it only when wiring the transport
 *   into something that frames messages itself.
 *
 * @param {object} [options]
 * @param {number} [options.port] - Listen port. `0` = OS-assigned.
 * @param {string} [options.host] - Listen host. Default `'127.0.0.1'`.
 * @param {'netstring' | 'none'} [options.framing] - Default `'netstring'`.
 * @returns {OcapnNoiseTransport}
 */
export const makeTcpTransport = ({
  port = 0,
  host = '127.0.0.1',
  framing = 'netstring',
} = {}) => {
  if (framing !== 'netstring' && framing !== 'none') {
    throw Error(
      `tcp transport: \`framing\` must be 'netstring' or 'none', got ${JSON.stringify(framing)}`,
    );
  }

  /** @type {Set<net.Socket>} */
  const openSockets = new Set();
  /** @type {net.Server | undefined} */
  let server;

  /**
   * @param {net.Socket} socket
   * @returns {ByteStream}
   */
  const wrap = socket => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    // Without an `error` listener, an `error` event before any reader
    // is iterating will crash the process via Node's "uncaught" path.
    // The Node reader installs its own listener once iteration starts,
    // but until then we need a no-op so the event doesn't become fatal.
    socket.on('error', () => {});
    const rawReader = makeNodeReader(socket);
    const rawWriter = makeNodeWriter(socket);
    if (framing === 'none') {
      return harden({
        reader: /** @type {any} */ (rawReader),
        writer: /** @type {any} */ (rawWriter),
      });
    }
    const reader = /** @type {any} */ (
      makeNetstringReader(rawReader, { maxMessageLength: MAX_FRAME_LENGTH })
    );
    const writer = /** @type {any} */ (makeNetstringWriter(rawWriter));
    return harden({ reader, writer });
  };

  /** @type {OcapnNoiseTransport} */
  const transport = harden({
    scheme: 'tcp',
    connect: async hints => {
      const hintHost = hints.host ?? '127.0.0.1';
      const portStr = hints.port;
      if (portStr === undefined) {
        throw Error(`tcp transport: missing 'port' hint`);
      }
      const portNum = Number.parseInt(portStr, 10);
      if (isNaN(portNum)) {
        throw Error(`tcp transport: invalid 'port' hint ${portStr}`);
      }
      const socket = net.createConnection({ host: hintHost, port: portNum });
      await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('error', reject);
      });
      return wrap(socket);
    },
    listen: async handler => {
      const srv = net.createServer(socket => handler(wrap(socket)));
      server = srv;
      await new Promise((resolve, reject) => {
        srv.once('error', reject);
        srv.listen(port, host, () => {
          srv.removeListener('error', reject);
          resolve(undefined);
        });
      });
      const addr = srv.address();
      if (!addr || typeof addr === 'string') {
        throw Error(`tcp transport: unexpected address ${addr}`);
      }
      /** @type {TransportListener} */
      const listener = harden({
        hints: {
          host: addr.address,
          port: addr.port.toString(),
        },
        close: () => {
          srv.close();
        },
      });
      return listener;
    },
    shutdown: () => {
      if (server) server.close();
      for (const socket of openSockets) socket.destroy();
      openSockets.clear();
    },
  });
  return transport;
};
