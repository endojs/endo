// @ts-check

/**
 * @typedef {import('../src/types.js').ByteStream} ByteStream
 * @typedef {import('../src/types.js').OcapnNoiseTransport} OcapnNoiseTransport
 * @typedef {import('../src/types.js').TransportListener} TransportListener
 */

import harden from '@endo/harden';
import { makeQueue } from '@endo/stream';

/**
 * Ack-less byte pipe: `writer.next(value)` queues `value` for the
 * reader without waiting for a read. Needed for any test where both
 * peers write before either reads. `@endo/stream`'s `makePipe` uses
 * ack-based back-pressure and would deadlock.
 *
 * @template T
 * @returns {[import('@endo/stream').Writer<T>, import('@endo/stream').Reader<T>]}
 */
const makeUnackedPipe = () => {
  /** @type {import('@endo/stream').AsyncQueue<IteratorResult<T, undefined>>} */
  const queue = makeQueue();
  let closed = false;
  const writer = /** @type {import('@endo/stream').Writer<T>} */ (
    harden({
      /** @param {T} value */
      async next(value) {
        if (closed) return harden({ done: true, value: undefined });
        queue.put(harden({ done: false, value }));
        return harden({ done: false, value: undefined });
      },
      async return() {
        closed = true;
        queue.put(harden({ done: true, value: undefined }));
        return harden({ done: true, value: undefined });
      },
      /** @param {Error} err */
      async throw(err) {
        closed = true;
        queue.put(harden(Promise.reject(err)));
        throw err;
      },
      [Symbol.asyncIterator]() {
        return writer;
      },
    })
  );
  const reader = /** @type {import('@endo/stream').Reader<T>} */ (
    harden({
      next: () => queue.get(),
      async return() {
        closed = true;
        return harden({ done: true, value: undefined });
      },
      /** @param {Error} err */
      async throw(err) {
        closed = true;
        throw err;
      },
      [Symbol.asyncIterator]() {
        return reader;
      },
    })
  );
  return [writer, reader];
};

/**
 * Build an in-process transport fabric shared by `N` peers. Each peer
 * gets its own `OcapnNoiseTransport` keyed by an arbitrary string name;
 * `connect({ to: '<name>' })` routes to the matching listener in the
 * shared directory. The fabric's name is the transport scheme so peers
 * can hint with `mesh:to=<name>`.
 */
export const makeMockMeshFabric = () => {
  /** @type {Map<string, (stream: ByteStream) => void>} */
  const listeners = new Map();
  /** @type {Set<() => void>} */
  const closers = new Set();

  /** @returns {[ByteStream, ByteStream]} */
  const makeBidirectional = () => {
    const [abWriter, abReader] = makeUnackedPipe();
    const [baWriter, baReader] = makeUnackedPipe();
    return [
      harden({ reader: baReader, writer: abWriter }),
      harden({ reader: abReader, writer: baWriter }),
    ];
  };

  /**
   * @param {string} name - unique name for this peer's listener.
   * @returns {OcapnNoiseTransport}
   */
  const transportFor = name => {
    /** @type {OcapnNoiseTransport} */
    const transport = harden({
      scheme: 'mesh',
      connect: async hints => {
        const target = hints.to;
        if (!target) throw Error(`mesh transport: missing 'to' hint`);
        const accept = listeners.get(target);
        if (!accept)
          throw Error(`mesh transport: no listener registered for ${target}`);
        const [outgoing, incoming] = makeBidirectional();
        accept(incoming);
        return outgoing;
      },
      listen: async handler => {
        if (listeners.has(name)) {
          throw Error(`mesh transport: ${name} already listening`);
        }
        listeners.set(name, handler);
        closers.add(() => listeners.delete(name));
        /** @type {TransportListener} */
        const listener = harden({
          hints: { to: name },
          close: () => listeners.delete(name),
        });
        return listener;
      },
      shutdown: () => {
        listeners.delete(name);
      },
    });
    return transport;
  };

  const shutdown = () => {
    for (const close of closers) close();
    closers.clear();
    listeners.clear();
  };

  return harden({ transportFor, shutdown });
};
