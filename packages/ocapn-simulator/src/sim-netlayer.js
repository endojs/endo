// A browser-only netlayer that ferries OCapN bytes between web workers
// through MessagePorts brokered by the main thread.
//
// One netlayer instance per worker. The transport name is `simworker`.
// Each worker picks a deterministic designator chosen by the main thread
// (so all workers know each other's location ahead of time).
//
// Wire protocol with the main thread (via `globalThis` postMessage):
//
//   worker -> main : { type: 'sim/connect', toDesignator }
//   main   -> worker: { type: 'sim/incoming-port', port, peerDesignator }
//   main   -> worker: { type: 'sim/outgoing-port', toDesignator, port }
//   main   -> worker: { type: 'sim/connect-failed', toDesignator, reason }
//
// Once both sides hold their MessagePort, application bytes flow
// directly: each side `port.postMessage({ kind: 'data', bytes })` with
// the bytes' ArrayBuffer transferred. Closing the connection sends
// `{ kind: 'close' }`.

import harden from '@endo/harden';

import { locationToLocationId } from '@endo/ocapn';
import { readOcapnHandshakeMessage } from '../../ocapn/src/codecs/operations.js';
import { makeSyrupReader } from '../../ocapn/src/syrup/decode.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/**
 * If bytes are a pre-session frame (op:start-session / op:abort), notify for viz.
 * @param {Uint8Array} bytes
 * @param {'send' | 'receive'} direction
 * @param {string} peerDesignator
 * @param {(d: { kind: string, direction: string, peer: string, reason?: string }) => void} [report]
 */
const tryReportPreSessionFrame = (bytes, direction, peerDesignator, report) => {
  if (!report) return;
  try {
    const reader = makeSyrupReader(bytes);
    if (reader.index >= bytes.length) return;
    const msg = readOcapnHandshakeMessage(reader);
    if (msg.type === 'op:start-session') {
      report({ kind: 'handshake', direction, peer: peerDesignator });
    } else if (msg.type === 'op:abort') {
      report({
        kind: 'abort',
        direction,
        peer: peerDesignator,
        reason: msg.reason,
      });
    }
  } catch {
    // Bytes are a post-handshake session frame or incomplete.
  }
};

/**
 * @typedef {object} SimNetlayerOptions
 * @property {string} designator   - This worker's stable identifier.
 * @property {() => number} getLatencyMs  - Per-write delay; read each call so the UI can tune live.
 * @property {object} mainBridge   - The object that knows how to talk to the main thread.
 * @property {(msg: any, transfer?: Transferable[]) => void} mainBridge.postToMain
 * @property {(handler: (msg: any) => void) => void} mainBridge.onMainMessage
 * @property {(detail: { kind: string, direction: 'send' | 'receive', peer: string, reason?: string }) => void} [reportPreSessionWire]
 */

/**
 * @param {SimNetlayerOptions} options
 * @returns {(handlers: import('@endo/ocapn').NetlayerHandlers, logger: any) => any}
 */
export const makeSimNetlayerFactory = ({
  designator,
  getLatencyMs,
  mainBridge,
  reportPreSessionWire,
}) => {
  // Build the location at construction time so the main thread can
  // refer to us by it.
  const location = harden({
    type: 'ocapn-peer',
    transport: 'simworker',
    designator,
    hints: harden({}),
  });

  return (handlers, logger) => {
    /** @type {Map<string, { connection: any, port?: MessagePort, pending: Uint8Array[] }>} */
    const outgoing = new Map();

    /**
     * Wrap a MessagePort as the netlayer's "socket" side. The connection
     * may be created before the port has been brokered; until that
     * happens we buffer writes locally.
     *
     * @param {string | undefined} outgoingKey - outgoing map key; undefined for incoming-only sockets
     * @param {() => MessagePort | undefined} getPort
     * @param {string} wirePeerDesignator - remote peer designator (viz / pre-session tap)
     * @returns {import('@endo/ocapn').SocketOperations}
     */
    const makeSocketOps = (outgoingKey, getPort, wirePeerDesignator) => {
      let closed = false;
      return {
        write(bytes) {
          if (closed) return;
          const send = port => {
            tryReportPreSessionFrame(
              bytes,
              'send',
              wirePeerDesignator,
              reportPreSessionWire,
            );
            const copy = new Uint8Array(bytes);
            try {
              port.postMessage({ kind: 'data', bytes: copy }, [copy.buffer]);
            } catch (err) {
              logger?.error?.('sim-netlayer write failed', err);
            }
          };
          const port = getPort();
          const latency = Math.max(0, getLatencyMs() | 0);
          const dispatch = () => {
            if (closed) return;
            const livePort = getPort();
            if (livePort) {
              send(livePort);
            } else if (port === undefined && outgoingKey !== undefined) {
              // Buffer until the port arrives.
              const slot = outgoing.get(outgoingKey);
              if (slot) slot.pending.push(bytes);
            }
          };
          if (latency > 0) {
            sleep(latency).then(dispatch);
          } else {
            dispatch();
          }
        },
        end() {
          if (closed) return;
          closed = true;
          const port = getPort();
          if (port) {
            try {
              port.postMessage({ kind: 'close' });
            } catch {}
            try {
              port.close();
            } catch {}
          }
        },
      };
    };

    /**
     * @param {string} peerDesignator
     * @param {MessagePort} port
     */
    const wireIncomingPort = (peerDesignator, port) => {
      let connection;
      const socketOps = makeSocketOps(undefined, () => port, peerDesignator);
      // eslint-disable-next-line no-use-before-define
      connection = handlers.makeConnection(netlayer, false, socketOps);
      port.onmessage = ev => {
        const data = ev.data;
        if (data?.kind === 'data') {
          const latency = Math.max(0, getLatencyMs() | 0);
          const bytes =
            data.bytes instanceof Uint8Array
              ? data.bytes
              : new Uint8Array(data.bytes);
          const deliver = () => {
            if (!connection.isDestroyed) {
              tryReportPreSessionFrame(
                bytes,
                'receive',
                peerDesignator,
                reportPreSessionWire,
              );
              try {
                handlers.handleMessageData(connection, bytes);
              } catch (err) {
                logger?.error?.('handleMessageData (incoming) threw', err);
              }
            }
          };
          if (latency > 0) sleep(latency).then(deliver);
          else deliver();
        } else if (data?.kind === 'close') {
          handlers.handleConnectionClose(connection);
        }
      };
      port.start();
    };

    /**
     * @param {string} toDesignator
     * @param {MessagePort} port
     */
    const wireOutgoingPort = (toDesignator, port) => {
      const slot = outgoing.get(toDesignator);
      if (!slot) {
        try {
          port.close();
        } catch {}
        return;
      }
      slot.port = port;
      port.onmessage = ev => {
        const data = ev.data;
        if (data?.kind === 'data') {
          const latency = Math.max(0, getLatencyMs() | 0);
          const bytes =
            data.bytes instanceof Uint8Array
              ? data.bytes
              : new Uint8Array(data.bytes);
          const deliver = () => {
            if (!slot.connection.isDestroyed) {
              tryReportPreSessionFrame(
                bytes,
                'receive',
                toDesignator,
                reportPreSessionWire,
              );
              try {
                handlers.handleMessageData(slot.connection, bytes);
              } catch (err) {
                logger?.error?.('handleMessageData (outgoing) threw', err);
              }
            }
          };
          if (latency > 0) sleep(latency).then(deliver);
          else deliver();
        } else if (data?.kind === 'close') {
          handlers.handleConnectionClose(slot.connection);
          outgoing.delete(toDesignator);
        }
      };
      port.start();
      // Flush any buffered writes that accumulated before the port
      // arrived. The latency was already paid when we deferred them.
      const pending = slot.pending;
      slot.pending = [];
      for (const bytes of pending) {
        tryReportPreSessionFrame(
          bytes,
          'send',
          toDesignator,
          reportPreSessionWire,
        );
        const copy = new Uint8Array(bytes);
        try {
          port.postMessage({ kind: 'data', bytes: copy }, [copy.buffer]);
        } catch (err) {
          logger?.error?.('sim-netlayer flush failed', err);
        }
      }
    };

    /**
     * @param {string} toDesignator
     * @param {string} reason
     */
    const failOutgoing = (toDesignator, reason) => {
      const slot = outgoing.get(toDesignator);
      if (!slot) return;
      outgoing.delete(toDesignator);
      handlers.handleConnectionClose(
        slot.connection,
        Error(`connect failed: ${reason}`),
      );
    };

    mainBridge.onMainMessage(msg => {
      if (msg?.type === 'sim/incoming-port') {
        wireIncomingPort(msg.peerDesignator, msg.port);
      } else if (msg?.type === 'sim/outgoing-port') {
        wireOutgoingPort(msg.toDesignator, msg.port);
      } else if (msg?.type === 'sim/connect-failed') {
        failOutgoing(msg.toDesignator, msg.reason);
      }
    });

    /**
     * @param {import('@endo/ocapn').OcapnLocation} target
     * @returns {import('@endo/ocapn').Connection}
     */
    const connect = target => {
      if (target.transport !== 'simworker') {
        throw Error(
          `sim-netlayer cannot connect to transport: ${target.transport}`,
        );
      }
      const key = target.designator;
      const existing = outgoing.get(key);
      if (existing && !existing.connection.isDestroyed) {
        return existing.connection;
      }
      if (existing) {
        outgoing.delete(key);
      }
      // Allocate a connection up front; the port arrives async.
      const slot = { connection: undefined, port: undefined, pending: [] };
      const socketOps = makeSocketOps(key, () => slot.port, key);
      const connection = handlers.makeConnection(netlayer, true, socketOps);
      slot.connection = connection;
      outgoing.set(key, slot);
      mainBridge.postToMain({ type: 'sim/connect', toDesignator: key });
      return connection;
    };

    const shutdown = () => {
      for (const slot of outgoing.values()) {
        if (slot.port) {
          try {
            slot.port.postMessage({ kind: 'close' });
          } catch {}
          try {
            slot.port.close();
          } catch {}
        }
        try {
          slot.connection.end();
        } catch {}
      }
      outgoing.clear();
    };

    const netlayer = harden({
      location,
      locationId: locationToLocationId(location),
      connect,
      shutdown,
    });
    return netlayer;
  };
};
