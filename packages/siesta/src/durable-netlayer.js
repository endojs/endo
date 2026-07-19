// @ts-check
/* global setTimeout, clearTimeout, crypto */
import harden from '@endo/harden';
import { Fail } from '@endo/errors';

/**
 * A netlayer wrapper that makes OCapN sessions survive transport
 * failures. OCapN has no session-resumption message, so resumption
 * lives here, beneath the OCapN codec: each logical connection is
 * identified by an unguessable resume token, every OCapN frame rides
 * in an envelope carrying a sequence number, both sides retain
 * unacknowledged frames, and a reconnecting originator replays the
 * tail the acceptor has not seen (and vice versa). The OCapN layer
 * above sees a single long-lived connection: it is never told about
 * the underlying socket coming and going, so its session — tables,
 * presences, promises — stays live across drops.
 *
 * Envelope wire format (inside the base netlayer's own framing; one
 * envelope per frame): an ASCII JSON header, a 0x0A byte, then an
 * optional binary payload.
 *
 * - `{ t: 'hello', tok }` — originator opens a new logical connection.
 * - `{ t: 'resume', tok, rcv }` — originator reconnects; it has
 *   received `rcv` frames on this logical connection.
 * - `{ t: 'welcome', rcv }` — acceptor's reply to hello/resume; each
 *   side then retransmits its retained frames numbered above the
 *   peer's `rcv`.
 * - `{ t: 'f', n }` + payload — one OCapN frame, sequence number `n`
 *   (1-based, per direction).
 * - `{ t: 'ack', n }` — cumulative receipt acknowledgment; the sender
 *   drops retained frames numbered `<= n`.
 * - `{ t: 'bye' }` — deliberate close; the logical connection ends and
 *   the OCapN layer is finally told.
 *
 * Prototype limits (documented in the design): retransmit buffers are
 * unbounded until acked, an acceptor parks a dropped logical
 * connection indefinitely awaiting resume, and resumption state is
 * held in memory — a process restart still ends the session (the
 * durable-session-across-restart layer builds on this seam).
 *
 * The types below are structural mirrors of the OCapN netlayer
 * interface (`packages/ocapn/src/client/types.js`), which the ocapn
 * package does not export.
 */

/**
 * @typedef {object} SocketOperations
 * @property {(bytes: Uint8Array) => void} write
 * @property {() => void} end
 *
 * @typedef {object} Connection
 * @property {any} netlayer
 * @property {boolean} isOutgoing
 * @property {boolean} isDestroyed
 * @property {(bytes: Uint8Array) => void} write
 * @property {() => void} end
 *
 * @typedef {object} NetlayerHandlers
 * @property {(netlayer: any, isOutgoing: boolean, socket: SocketOperations) => Connection} makeConnection
 * @property {(connection: Connection, data: Uint8Array) => void} handleMessageData
 * @property {(connection: Connection, reason?: Error) => void} handleConnectionClose
 *
 * @typedef {object} Logger
 * @property {(...args: Array<unknown>) => void} log
 * @property {(...args: Array<unknown>) => void} error
 * @property {(...args: Array<unknown>) => void} info
 *
 * @typedef {any} OcapnLocation
 *
 * @typedef {object} NetLayer
 * @property {OcapnLocation} location
 * @property {any} locationId
 * @property {(location: OcapnLocation) => Connection} connect
 * @property {() => void} shutdown
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const NEWLINE = 0x0a;

/**
 * @param {Record<string, unknown>} header
 * @param {Uint8Array} [payload]
 * @returns {Uint8Array}
 */
const encodeEnvelope = (header, payload) => {
  const headerBytes = textEncoder.encode(JSON.stringify(header));
  const frame = new Uint8Array(
    headerBytes.length + 1 + (payload ? payload.length : 0),
  );
  frame.set(headerBytes, 0);
  frame[headerBytes.length] = NEWLINE;
  if (payload) {
    frame.set(payload, headerBytes.length + 1);
  }
  return frame;
};

/**
 * @param {Uint8Array} frame
 * @returns {{ header: any, payload: Uint8Array }}
 */
const decodeEnvelope = frame => {
  const nl = frame.indexOf(NEWLINE);
  nl >= 0 || Fail`durable netlayer: envelope missing header terminator`;
  const header = JSON.parse(textDecoder.decode(frame.subarray(0, nl)));
  // Downstream OCapN decoding requires a zero-byteOffset view.
  const payload = frame.slice(nl + 1);
  return { header, payload };
};

const makeToken = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * @param {object} options
 * @param {NetlayerHandlers} options.handlers the real OCapN handlers;
 *   the wrapper reports only logical (not physical) connection events
 * @param {Logger} options.logger
 * @param {(powers: { handlers: any, logger: any }) => any} options.makeBaseNetlayer
 *   factory for the underlying transport netlayer (e.g. TCP)
 * @param {number} [options.reconnectDelayMs] initial reconnect backoff
 * @param {number} [options.maxReconnectDelayMs]
 * @returns {Promise<NetLayer>}
 */
export const makeDurableNetLayer = async ({
  handlers,
  logger,
  makeBaseNetlayer,
  reconnectDelayMs = 50,
  maxReconnectDelayMs = 1000,
}) => {
  /**
   * One resumable logical connection. `ocapnConnection` is the stable
   * connection object the OCapN layer holds; `transport` is whatever
   * physical connection currently carries it (undefined while dropped).
   *
   * @typedef {object} LogicalConnection
   * @property {string} token
   * @property {boolean} isOriginator
   * @property {OcapnLocation | undefined} remoteLocation
   * @property {Connection} ocapnConnection
   * @property {number} sendSeq
   * @property {Array<{ n: number, bytes: Uint8Array }>} sendBuf
   * @property {number} recvSeq
   * @property {Connection | undefined} transport
   * @property {boolean} flowing true once the peer's `rcv` is known for
   *   the current transport, so writes may flow (before that they only
   *   accumulate in `sendBuf`)
   * @property {boolean} destroyed
   * @property {ReturnType<typeof setTimeout> | undefined} reconnectTimer
   * @property {number} reconnectDelay
   */

  /** @type {Map<string, LogicalConnection>} */
  const logicalByToken = new Map();
  /** @type {Map<Connection, LogicalConnection>} */
  const logicalByTransport = new Map();
  /** @type {Map<string, LogicalConnection>} */
  const outgoingByLocationId = new Map();

  let shuttingDown = false;

  /** @type {NetLayer} */
  let base;

  /**
   * @param {LogicalConnection} logical
   * @param {Record<string, unknown>} header
   * @param {Uint8Array} [payload]
   */
  const transportWrite = (logical, header, payload) => {
    const { transport } = logical;
    if (transport === undefined || transport.isDestroyed) {
      return;
    }
    try {
      transport.write(encodeEnvelope(header, payload));
    } catch (error) {
      // A write can race the socket's death (the close event has not
      // fired yet). This layer must never throw into the OCapN send
      // path: the frame is retained in sendBuf, so treat the transport
      // as lost and let the close/resume machinery redeliver it.
      logger.info('durable netlayer: write failed; treating as lost', error);
      transport.end();
    }
  };

  /**
   * The peer told us how many frames it has received on this logical
   * connection: drop what it has, retransmit what it lacks, and open
   * the write path.
   *
   * @param {LogicalConnection} logical
   * @param {number} peerRcv
   */
  const openFlow = (logical, peerRcv) => {
    logical.sendBuf = logical.sendBuf.filter(entry => entry.n > peerRcv);
    logical.flowing = true;
    for (const entry of logical.sendBuf) {
      transportWrite(logical, { t: 'f', n: entry.n }, entry.bytes);
    }
  };

  /** @param {LogicalConnection} logical */
  const scheduleReconnect = logical => {
    if (
      shuttingDown ||
      logical.destroyed ||
      !logical.isOriginator ||
      logical.reconnectTimer !== undefined ||
      logical.transport !== undefined
    ) {
      return;
    }
    const delay = logical.reconnectDelay;
    logical.reconnectDelay = Math.min(delay * 2, maxReconnectDelayMs);
    logical.reconnectTimer = setTimeout(() => {
      logical.reconnectTimer = undefined;
      if (logical.destroyed || logical.transport !== undefined) {
        return;
      }
      const location = /** @type {OcapnLocation} */ (logical.remoteLocation);
      let transport;
      try {
        transport = /** @type {Connection} */ (base.connect(location));
      } catch (error) {
        logger.info('durable netlayer: reconnect attempt failed', error);
        scheduleReconnect(logical);
        return;
      }
      logical.transport = transport;
      logical.flowing = false;
      logicalByTransport.set(transport, logical);
      transportWrite(logical, {
        t: 'resume',
        tok: logical.token,
        rcv: logical.recvSeq,
      });
    }, delay);
    if (typeof logical.reconnectTimer === 'object') {
      logical.reconnectTimer.unref?.();
    }
  };

  /**
   * Ends the logical connection for real: the OCapN layer is told the
   * connection closed, so the session above aborts.
   *
   * @param {LogicalConnection} logical
   * @param {string} [reason]
   */
  const destroyLogical = (logical, reason) => {
    if (logical.destroyed) {
      return;
    }
    logical.destroyed = true;
    if (logical.reconnectTimer !== undefined) {
      clearTimeout(logical.reconnectTimer);
      logical.reconnectTimer = undefined;
    }
    const { transport } = logical;
    if (transport !== undefined && !transport.isDestroyed) {
      transportWrite(logical, { t: 'bye' });
      transport.end();
    }
    logicalByToken.delete(logical.token);
    if (logical.transport) {
      logicalByTransport.delete(logical.transport);
      logical.transport = undefined;
    }
    for (const [key, value] of outgoingByLocationId.entries()) {
      if (value === logical) {
        outgoingByLocationId.delete(key);
      }
    }
    handlers.handleConnectionClose(
      logical.ocapnConnection,
      reason === undefined ? undefined : Error(reason),
    );
  };

  /**
   * @param {string} token
   * @param {boolean} isOriginator
   * @param {OcapnLocation | undefined} remoteLocation
   * @returns {LogicalConnection}
   */
  const makeLogical = (token, isOriginator, remoteLocation) => {
    /** @type {LogicalConnection} */
    const logical = {
      token,
      isOriginator,
      remoteLocation,
      // Assigned immediately below via handlers.makeConnection.
      ocapnConnection: /** @type {any} */ (undefined),
      sendSeq: 0,
      sendBuf: [],
      recvSeq: 0,
      transport: undefined,
      flowing: false,
      destroyed: false,
      reconnectTimer: undefined,
      reconnectDelay: reconnectDelayMs,
    };
    /** @type {SocketOperations} */
    const logicalOps = {
      write: bytes => {
        if (logical.destroyed) {
          return;
        }
        logical.sendSeq += 1;
        const entry = { n: logical.sendSeq, bytes };
        logical.sendBuf.push(entry);
        if (logical.flowing) {
          transportWrite(logical, { t: 'f', n: entry.n }, entry.bytes);
        }
      },
      end: () => {
        destroyLogical(logical, 'closed locally');
      },
    };
    // eslint-disable-next-line no-use-before-define
    logical.ocapnConnection = handlers.makeConnection(
      // eslint-disable-next-line no-use-before-define
      netlayer,
      isOriginator,
      logicalOps,
    );
    logicalByToken.set(token, logical);
    return logical;
  };

  /**
   * Handlers given to the base transport netlayer. Physical
   * connections never reach the OCapN layer; they carry envelopes for
   * logical connections.
   *
   * @type {NetlayerHandlers}
   */
  const subHandlers = harden({
    makeConnection: (_netlayer, isOutgoing, socketOps) => {
      let isDestroyed = false;
      /** @type {Connection} */
      const physical = harden({
        netlayer: /** @type {any} */ (base),
        isOutgoing,
        get isDestroyed() {
          return isDestroyed;
        },
        write: bytes => socketOps.write(bytes),
        end: () => {
          if (isDestroyed) {
            return;
          }
          isDestroyed = true;
          socketOps.end();
        },
      });
      return physical;
    },
    handleMessageData: (physical, frame) => {
      /** @type {any} */
      let header;
      /** @type {Uint8Array} */
      let payload;
      try {
        ({ header, payload } = decodeEnvelope(frame));
      } catch (error) {
        logger.error('durable netlayer: garbled envelope', error);
        physical.end();
        return;
      }
      const bound = logicalByTransport.get(physical);
      switch (header.t) {
        case 'hello': {
          if (bound !== undefined || typeof header.tok !== 'string') {
            physical.end();
            return;
          }
          const logical = makeLogical(header.tok, false, undefined);
          logical.transport = physical;
          logicalByTransport.set(physical, logical);
          transportWrite(logical, { t: 'welcome', rcv: logical.recvSeq });
          openFlow(logical, 0);
          break;
        }
        case 'resume': {
          if (bound !== undefined || typeof header.tok !== 'string') {
            physical.end();
            return;
          }
          const logical = logicalByToken.get(header.tok);
          if (logical === undefined || logical.destroyed) {
            // Unknown logical connection: nothing to resume. Close the
            // physical link; the originator's OCapN session stays in
            // limbo until it deliberately ends it. (The durable-session
            // layer will answer with state restored from disk instead.)
            logger.info('durable netlayer: resume for unknown token');
            physical.end();
            return;
          }
          if (logical.transport !== undefined) {
            logicalByTransport.delete(logical.transport);
            logical.transport.end();
          }
          logical.transport = physical;
          logical.flowing = false;
          logicalByTransport.set(physical, logical);
          transportWrite(logical, { t: 'welcome', rcv: logical.recvSeq });
          openFlow(logical, Number(header.rcv ?? 0));
          break;
        }
        case 'welcome': {
          if (bound === undefined) {
            physical.end();
            return;
          }
          bound.reconnectDelay = reconnectDelayMs;
          openFlow(bound, Number(header.rcv ?? 0));
          break;
        }
        case 'f': {
          if (bound === undefined) {
            physical.end();
            return;
          }
          const n = Number(header.n);
          if (n <= bound.recvSeq) {
            // Duplicate from a retransmit overlap; already processed.
            return;
          }
          if (n !== bound.recvSeq + 1) {
            // A gap should be impossible over an ordered transport;
            // drop the physical link and let resumption recover.
            logger.error(
              `durable netlayer: frame gap (got ${n}, expected ${bound.recvSeq + 1})`,
            );
            physical.end();
            return;
          }
          bound.recvSeq = n;
          transportWrite(bound, { t: 'ack', n });
          handlers.handleMessageData(bound.ocapnConnection, payload);
          break;
        }
        case 'ack': {
          if (bound === undefined) {
            return;
          }
          const n = Number(header.n);
          bound.sendBuf = bound.sendBuf.filter(entry => entry.n > n);
          break;
        }
        case 'bye': {
          if (bound === undefined) {
            return;
          }
          logicalByTransport.delete(physical);
          bound.transport = undefined;
          destroyLogical(bound, 'closed by peer');
          break;
        }
        default: {
          logger.error(`durable netlayer: unknown envelope type ${header.t}`);
          physical.end();
        }
      }
    },
    handleConnectionClose: physical => {
      const logical = logicalByTransport.get(physical);
      if (logical === undefined) {
        return;
      }
      logicalByTransport.delete(physical);
      if (logical.transport === physical) {
        logical.transport = undefined;
        logical.flowing = false;
      }
      if (logical.destroyed || shuttingDown) {
        return;
      }
      // Transient transport loss: say nothing to the OCapN layer.
      // Originators reconnect; acceptors park awaiting a resume.
      logger.info(
        `durable netlayer: transport lost for ${logical.token}; ${
          logical.isOriginator ? 'reconnecting' : 'parked awaiting resume'
        }`,
      );
      scheduleReconnect(logical);
    },
  });

  base = await makeBaseNetlayer({ handlers: subHandlers, logger });

  /** @param {OcapnLocation} location */
  const connect = location => {
    const locationId = JSON.stringify(location);
    const existing = outgoingByLocationId.get(locationId);
    if (existing !== undefined && !existing.destroyed) {
      return existing.ocapnConnection;
    }
    const token = makeToken();
    const logical = makeLogical(token, true, location);
    outgoingByLocationId.set(locationId, logical);
    const transport = /** @type {Connection} */ (base.connect(location));
    logical.transport = transport;
    logicalByTransport.set(transport, logical);
    transportWrite(logical, { t: 'hello', tok: token });
    return logical.ocapnConnection;
  };

  const shutdown = () => {
    shuttingDown = true;
    for (const logical of [...logicalByToken.values()]) {
      destroyLogical(logical, 'netlayer shutdown');
    }
    base.shutdown();
  };

  /** @type {NetLayer} */
  const netlayer = harden({
    location: base.location,
    locationId: base.locationId,
    connect,
    shutdown,
  });
  return netlayer;
};
harden(makeDurableNetLayer);
