// @ts-check

/**
 * In-process transport fabric whose byte pipes deliver each
 * `writer.next(value)` as multiple smaller chunks rather than as one
 * atomic `reader.next()` value.  This exposes any framing assumption
 * baked into the network layer (`readFrame` expects one
 * `reader.next()` to yield one whole message) by forcing it to flow
 * through `@endo/netstring`'s reassembly path: exactly what the TCP
 * transport relies on at the kernel boundary.
 *
 * @typedef {import('../src/types.js').ByteStream} ByteStream
 * @typedef {import('../src/types.js').OcapnNoiseTransport} OcapnNoiseTransport
 * @typedef {import('../src/types.js').TransportListener} TransportListener
 */

import harden from '@endo/harden';
import { makeQueue } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

/**
 * Tiny seeded LCG.  Inlined to avoid an extra dep; deterministic so a
 * test failure reproduces with the same `seed`.
 *
 * @param {number} seed
 */
const makeLcg = seed => {
  // The bitwise unsigned-right-shift would be the canonical way to
  // wrap to a uint32, but `no-bitwise` is on; modular arithmetic
  // gets the same effect with one extra multiply.
  const TWO32 = 2 ** 32;
  let state = ((seed % TWO32) + TWO32) % TWO32;
  return {
    /** @param {number} max */
    nextInRange: max => {
      state = (Math.imul(state, 1664525) + 1013904223) % TWO32;
      if (state < 0) state += TWO32;
      return state % max;
    },
  };
};

/**
 * Raw byte pipe: like `_fabric.js`'s unacked pipe but with no
 * framing.  Each `writer.next(bytes)` is delivered to the reader as
 * one chunk; the fragmenting layer above splits values into multiple
 * such writes before calling here.
 */
const makeRawBytePipe = () => {
  /** @type {import('@endo/stream').AsyncQueue<IteratorResult<Uint8Array, undefined>>} */
  const queue = makeQueue();
  let closed = false;
  const writer = /** @type {import('@endo/stream').Writer<Uint8Array>} */ (
    harden({
      /** @param {Uint8Array} value */
      async next(value) {
        if (closed) return harden({ done: true, value: undefined });
        queue.put(harden({ done: false, value }));
        return harden({ done: false, value: undefined });
      },
      async return() {
        if (!closed) {
          closed = true;
          queue.put(harden({ done: true, value: undefined }));
        }
        return harden({ done: true, value: undefined });
      },
      /** @param {Error} err */
      async throw(err) {
        if (!closed) {
          closed = true;
          queue.put(harden(Promise.reject(err)));
        }
        throw err;
      },
      [Symbol.asyncIterator]() {
        return writer;
      },
    })
  );
  const reader = /** @type {import('@endo/stream').Reader<Uint8Array>} */ (
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
  return harden({ writer, reader });
};

/**
 * Wrap a raw `Writer<Uint8Array>` so each `next(value)` is split into
 * 1..maxChunk-byte sub-writes before delivery.  Sizes are drawn from
 * the supplied LCG.
 *
 * @param {import('@endo/stream').Writer<Uint8Array>} inner
 * @param {{ nextInRange: (max: number) => number }} rng
 * @param {number} maxChunk
 * @returns {import('@endo/stream').Writer<Uint8Array>}
 */
const makeFragmentingWriter = (inner, rng, maxChunk) => {
  const writer = /** @type {import('@endo/stream').Writer<Uint8Array>} */ (
    harden({
      /** @param {Uint8Array} value */
      async next(value) {
        let offset = 0;
        while (offset < value.length) {
          // pick a chunk size in [1, min(maxChunk, remaining)]
          const remaining = value.length - offset;
          const cap = Math.min(maxChunk, remaining);
          const size = 1 + rng.nextInRange(cap);
          // eslint-disable-next-line no-await-in-loop
          await inner.next(value.subarray(offset, offset + size));
          offset += size;
        }
        return harden({ done: false, value: undefined });
      },
      async return() {
        return inner.return(undefined);
      },
      /** @param {Error} err */
      async throw(err) {
        return inner.throw(err);
      },
      [Symbol.asyncIterator]() {
        return writer;
      },
    })
  );
  return writer;
};

/**
 * Build a bidirectional stream pair where each direction is:
 *   netstring writer → fragmenting writer → raw pipe → netstring
 *   reader.
 * That mirrors the TCP transport's framing contract exactly while
 * exercising the fragmentation path.
 *
 * @param {{ nextInRange: (max: number) => number }} rng
 * @param {number} maxChunk
 * @returns {[ByteStream, ByteStream]}
 */
const makeBidirectional = (rng, maxChunk) => {
  const ab = makeRawBytePipe();
  const ba = makeRawBytePipe();
  const abFragmenting = makeFragmentingWriter(ab.writer, rng, maxChunk);
  const baFragmenting = makeFragmentingWriter(ba.writer, rng, maxChunk);
  const abNetstringWriter = /** @type {any} */ (
    makeNetstringWriter(abFragmenting)
  );
  const baNetstringWriter = /** @type {any} */ (
    makeNetstringWriter(baFragmenting)
  );
  const abNetstringReader = /** @type {any} */ (
    makeNetstringReader(ab.reader, { maxMessageLength: 65551 })
  );
  const baNetstringReader = /** @type {any} */ (
    makeNetstringReader(ba.reader, { maxMessageLength: 65551 })
  );
  return [
    harden({ reader: baNetstringReader, writer: abNetstringWriter }),
    harden({ reader: abNetstringReader, writer: baNetstringWriter }),
  ];
};

/**
 * Build an in-process mesh fabric shaped like `makeMockMeshFabric`,
 * but with fragmented byte deliveries reassembled by netstring
 * framing.  Use a fixed `seed` so failures reproduce.
 *
 * @param {{ seed?: number, maxChunk?: number }} [options]
 */
export const makeFragmentingMockMeshFabric = ({
  seed = 1,
  maxChunk = 13,
} = {}) => {
  const rng = makeLcg(seed);

  /** @type {Map<string, (stream: ByteStream) => void>} */
  const listeners = new Map();
  /** @type {Set<() => void>} */
  const closers = new Set();

  /**
   * @param {string} name
   * @returns {OcapnNoiseTransport}
   */
  const transportFor = name => {
    /** @type {OcapnNoiseTransport} */
    const transport = harden({
      scheme: 'frag',
      connect: async hints => {
        const target = hints.to;
        if (!target) throw Error(`frag transport: missing 'to' hint`);
        const accept = listeners.get(target);
        if (!accept)
          throw Error(`frag transport: no listener registered for ${target}`);
        const [outgoing, incoming] = makeBidirectional(rng, maxChunk);
        accept(incoming);
        return outgoing;
      },
      listen: async handler => {
        if (listeners.has(name)) {
          throw Error(`frag transport: ${name} already listening`);
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

  return harden({ transportFor, shutdown, seed });
};
