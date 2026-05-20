// @ts-check
/* global setTimeout */

import net from 'net';
import harden from '@endo/harden';
import { makePipe } from '@endo/stream';
import { makeSyrupReader } from '@endo/syrup-frame/reader.js';

import { locationToLocationId } from '../client/util.js';

/**
 * @import { Connection, Logger, NetLayer, NetlayerHandlers, SocketOperations } from '../client/types.js'
 * @import { OcapnLocation } from '../codecs/components.js'
 * @import { Reader, Writer } from '@endo/stream'
 */

/**
 * Wire framing for the test-only TCP netlayer.
 *
 * - `'syrup'` (default): each message is wrapped in the
 *   `<length>:<payload>` framing implemented by `@endo/syrup-frame`.
 *   Robust against TCP chunk boundaries that split a single OCapN
 *   message; the spec is moving toward this framing for the
 *   TCP-for-testing netlayer.
 * - `'none'`: each write is sent as raw bytes, and each
 *   `socket.on('data')` chunk is dispatched as a complete OCapN
 *   message. Retained only for compatibility with the existing
 *   `ocapn/ocapn-test-suite` Python `testing_only_tcp` netlayer,
 *   which writes a syrup-encoded record with `sendall` and reads
 *   one back with `syrup.syrup_read` (no length prefix on the wire).
 *   That suite is known to be inadequate against the possibility of
 *   a TCP chunk getting split across packets; the `'none'` option
 *   goes away once the Python suite either adopts syrup framing or
 *   is retired.
 *
 * @typedef {'none' | 'syrup'} TcpTestOnlyFraming
 */

const { isNaN } = Number;

const textEncoder = new TextEncoder();

/**
 * @param {Buffer} buffer
 * @returns {Uint8Array}
 */
const bufferToBytes = buffer => {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};

/**
 * Creates socket operations with optional write latency.
 * @param {net.Socket} socket
 * @param {number} writeLatencyMs
 * @returns {SocketOperations}
 */
const makeSocketOperations = (socket, writeLatencyMs) => {
  return {
    write(bytes) {
      if (writeLatencyMs > 0) {
        setTimeout(() => {
          if (!socket.destroyed) {
            socket.write(bytes);
          }
        }, writeLatencyMs);
      } else {
        socket.write(bytes);
      }
    },
    end() {
      socket.end();
    },
  };
};

/**
 * Wraps `socketOps` so that `write(bytes)` emits a syrup-framed
 * record (`<length>:<payload>`) instead of raw bytes. Builds the
 * length-prefixed buffer synchronously and forwards a single
 * `socketOps.write` call, matching the synchronous shape of the
 * `SocketOperations` interface. (The earlier indirection through
 * `@endo/syrup-frame`'s async `Writer` over a microtask-resolving
 * sink was a sync/async impedance mismatch: the returned promise was
 * always discarded and any write error from the sink would have been
 * silently swallowed. Socket-level errors surface through the
 * `socket.on('error')` handler set up in `setupSocketHandlers`.)
 *
 * @param {SocketOperations} socketOps
 * @returns {SocketOperations}
 */
const makeSyrupWritingSocketOperations = socketOps => {
  return {
    write(bytes) {
      const prefix = textEncoder.encode(`${bytes.length}:`);
      const frame = new Uint8Array(prefix.length + bytes.length);
      frame.set(prefix, 0);
      frame.set(bytes, prefix.length);
      socketOps.write(frame);
    },
    end() {
      socketOps.end();
    },
  };
};

/**
 * Wires a stream pipe between socket `data` events and the
 * `@endo/syrup-frame` reader. Each whole frame is forwarded to
 * `onFrame`. Errors and pipe closure are reported to `logger`.
 *
 * @param {Logger} logger
 * @param {(frame: Uint8Array) => void} onFrame
 * @returns {{ pushChunk: (chunk: Uint8Array) => void, end: () => void }}
 */
const makeSyrupDeframer = (logger, onFrame) => {
  /** @type {[Writer<Uint8Array>, Reader<Uint8Array>]} */
  const pipe = makePipe();
  const [chunkWriter, chunkReader] = pipe;
  const syrupReader = makeSyrupReader(chunkReader, {
    name: 'tcp-testing-only',
  });
  let closed = false;
  // Drain the reader in the background; surface decode errors via
  // the logger and stop forwarding once closed.
  const drain = async () => {
    await null;
    try {
      for await (const frame of syrupReader) {
        if (closed) {
          break;
        }
        // The syrup reader may yield a `subarray()` of an internal
        // buffer; downstream OCapN syrup decoding requires a
        // zero-`byteOffset` view, so `slice()` to allocate a fresh
        // owned copy before dispatching.
        onFrame(frame.slice());
      }
    } catch (err) {
      if (!closed) {
        logger.error('Syrup deframer error:', err);
      }
    }
  };
  drain();
  return {
    pushChunk(chunk) {
      if (closed) {
        return;
      }
      chunkWriter.next(chunk).catch(() => {});
    },
    end() {
      if (closed) {
        return;
      }
      closed = true;
      chunkWriter.return(undefined).catch(() => {});
    },
  };
};

/**
 * @typedef {object} ConnectionSocketPair
 * @property {Connection} connection
 * @property {net.Socket} socket
 */

/**
 * Debug interface for test-only netlayer.
 * @typedef {object} TcpTestOnlyNetLayerDebug
 * @property {(location: OcapnLocation) => ConnectionSocketPair} establishConnection
 *
 * @typedef {NetLayer & { _debug: TcpTestOnlyNetLayerDebug }} TcpTestOnlyNetLayer
 */

/**
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers
 * @param {import('../client/types.js').Logger} options.logger
 * @param {number} [options.specifiedPort]
 * @param {string} [options.specifiedHostname]
 * @param {string} [options.specifiedDesignator]
 * @param {number} [options.writeLatencyMs] - Optional artificial latency for writes (ms), useful for testing pipelining
 * @param {TcpTestOnlyFraming} [options.framing] - Wire framing for outbound writes and inbound reads. Defaults to `'syrup'`, the framing the OCapN TCP-for-testing netlayer is moving toward. Pass `'none'` to interoperate with the existing Python `ocapn-test-suite` `testing_only_tcp` netlayer (raw syrup record per write, no length prefix).
 * @returns {Promise<TcpTestOnlyNetLayer>}
 */
export const makeTcpNetLayer = async ({
  handlers,
  logger,
  specifiedPort = 0,
  specifiedHostname = '127.0.0.1',
  // Unclear if a fallback value is reasonable.
  specifiedDesignator = '0000',
  writeLatencyMs = 0,
  framing = 'syrup',
}) => {
  if (framing !== 'none' && framing !== 'syrup') {
    throw Error(`Unsupported framing: ${framing}`);
  }
  // Create and start TCP server
  const server = net.createServer();

  /**
   * @returns {Promise<void>}
   */
  const listen = () => {
    return new Promise((resolve, reject) => {
      server.listen(specifiedPort, specifiedHostname, err => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  await listen();
  const addressInfo = server.address();
  if (typeof addressInfo !== 'object' || addressInfo === null) {
    throw Error('Unexpected Server Address Info');
  }
  const { address, port } = addressInfo;
  logger.log('Server listening on', `${address}:${port}`);

  /** @type {OcapnLocation} */
  const localLocation = {
    type: 'ocapn-peer',
    transport: 'tcp-testing-only',
    designator: specifiedDesignator,
    hints: {
      host: address,
      port: port.toString(),
    },
  };

  /** @type {Map<string, Connection>} */
  const outgoingConnections = new Map();

  /** @type {Set<net.Socket>} */
  const activeSockets = new Set();

  /**
   * Sets up socket event handlers for both incoming and outgoing connections.
   * @param {net.Socket} socket
   * @param {Connection} connection
   * @param {() => void} [onClose] - Optional additional cleanup on close
   */
  const setupSocketHandlers = (socket, connection, onClose) => {
    activeSockets.add(socket);

    // When framing is `'syrup'`, run inbound bytes through the
    // syrup deframer so each call to `handleMessageData` carries
    // exactly one OCapN message regardless of how TCP chunked the
    // wire. With `'none'` framing, dispatch raw chunks unchanged.
    const deframer =
      framing === 'syrup'
        ? makeSyrupDeframer(logger, frame => {
            if (!connection.isDestroyed) {
              handlers.handleMessageData(connection, frame);
            } else {
              logger.info(
                'TcpTestOnlyNetLayer received message after connection was destroyed',
              );
            }
          })
        : undefined;

    socket.on('data', data => {
      const bytes = bufferToBytes(data);
      if (deframer) {
        deframer.pushChunk(bytes);
        return;
      }
      if (!connection.isDestroyed) {
        handlers.handleMessageData(connection, bytes);
      } else {
        logger.info(
          'TcpTestOnlyNetLayer received message after connection was destroyed',
        );
      }
    });

    socket.on('error', err => {
      logger.error('Socket error:', err, err.message, err.stack);
      connection.end();
    });

    socket.on('close', () => {
      logger.info('Connection closed');
      activeSockets.delete(socket);
      if (deframer) {
        deframer.end();
      }
      if (onClose) {
        onClose();
      }
      // Mark the connection destroyed before notifying the client.
      // Otherwise a socket that closes without the userland data handler
      // first observing an op:abort (e.g. RST, dropped in-flight bytes,
      // or close racing data delivery) would leave `connection.isDestroyed`
      // false, which causes test waiters and reconnect logic to hang.
      connection.end();
      handlers.handleConnectionClose(connection);
    });
  };

  /**
   * Returns the socket operations the client connection should use.
   * For `'syrup'` framing, wraps the raw socket operations in a
   * syrup writer so every call to `connection.write` becomes one
   * length-prefixed frame on the wire.
   * @param {net.Socket} socket
   * @returns {SocketOperations}
   */
  const makeFramedSocketOperations = socket => {
    const rawOps = makeSocketOperations(socket, writeLatencyMs);
    if (framing === 'syrup') {
      return makeSyrupWritingSocketOperations(rawOps);
    }
    // `'none'` framing is retained only for the existing Python
    // `ocapn-test-suite` `testing_only_tcp` netlayer, which is
    // inadequate against TCP chunks split across packets. See the
    // `TcpTestOnlyFraming` typedef.
    return rawOps;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {ConnectionSocketPair}
   */
  const internalEstablishConnection = location => {
    if (typeof location.hints !== 'object') {
      throw new Error('Hints required for remote connections');
    }
    const { host, port: portStr } = location.hints;
    if (host === undefined || portStr === undefined) {
      throw new Error(
        'Host and port hints are required for remote connections',
      );
    }
    const remotePort = parseInt(portStr, 10);
    if (isNaN(remotePort)) {
      throw new Error(`Invalid port in hints: ${portStr}`);
    }
    const socket = net.createConnection({ host, port: remotePort });

    const socketOps = makeFramedSocketOperations(socket);
    // eslint-disable-next-line no-use-before-define
    const connection = handlers.makeConnection(netlayer, true, socketOps);

    setupSocketHandlers(socket, connection, () => {
      // Only evict ourselves from the outgoing map. The map may contain a
      // *different* connection for this designator (e.g. one created by a
      // later `lookupOrConnect`) when this one was created via the debug
      // `establishConnection` helper that bypasses registration. An
      // unconditional delete would silently break later sessions.
      if (outgoingConnections.get(location.designator) === connection) {
        outgoingConnections.delete(location.designator);
      }
    });

    return { connection, socket };
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const connect = location => {
    logger.info('Connecting to', location);
    const { connection } = internalEstablishConnection(location);
    return connection;
  };

  /**
   * @param {OcapnLocation} location
   * @returns {Connection}
   */
  const lookupOrConnect = location => {
    if (location.transport !== localLocation.transport) {
      throw Error(`Unsupported transport: ${location.transport}`);
    }
    const existingConnection = outgoingConnections.get(location.designator);
    // Only reuse connection if it's not destroyed
    if (existingConnection && !existingConnection.isDestroyed) {
      logger.info(`lookupOrConnect returning existing connection`);
      return existingConnection;
    }
    // Remove destroyed connection from map
    if (existingConnection) {
      logger.info(`lookupOrConnect removing destroyed connection`);
      outgoingConnections.delete(location.designator);
    }
    logger.info(`lookupOrConnect creating new connection`);
    const newConnection = connect(location);
    outgoingConnections.set(location.designator, newConnection);
    return newConnection;
  };

  const shutdown = () => {
    server.close();
    // Destroy all active sockets (both incoming and outgoing)
    for (const socket of activeSockets) {
      socket.destroy();
    }
    activeSockets.clear();
    outgoingConnections.clear();
  };

  /** @type {TcpTestOnlyNetLayer} */
  const netlayer = harden({
    location: localLocation,
    locationId: locationToLocationId(localLocation),
    connect: lookupOrConnect,
    shutdown,
    // eslint-disable-next-line no-underscore-dangle
    _debug: {
      establishConnection: internalEstablishConnection,
    },
  });

  server.on('connection', socket => {
    logger.info(
      'Client connected to server',
      `${socket.remoteAddress}:${socket.remotePort}`,
    );

    const socketOps = makeFramedSocketOperations(socket);
    const connection = handlers.makeConnection(netlayer, false, socketOps);

    setupSocketHandlers(socket, connection);
  });

  return netlayer;
};
