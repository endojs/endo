// @ts-check

// An in-memory, duck-typed stand-in for the `@number0/iroh` 1.0 native
// binding, implementing exactly the surface the netlayer touches:
//
//   - `Endpoint.bind({ secretKey, alpns })`
//   - `endpoint.id().toString()` / `endpoint.addr()` /
//     `endpoint.connect(endpointAddr, alpn)` / `endpoint.acceptNext()` /
//     `endpoint.close()`
//   - `Incoming -> Accepting -> Connection` accept handshake
//   - `connection.openBi()` / `connection.acceptBi()` /
//     `connection.close(code, reason)` / `connection.closed()`
//   - `bi.send.writeAll(Array<number>)` / `bi.send.finish()` /
//     `bi.send.reset(code)` and `bi.recv.read(sizeLimit)` (empty == EOF)
//
// Writes are deliberately split into small chunks so the netlayer's
// netstring reassembly across read boundaries is exercised. Datagram
// methods are intentionally absent: the heartbeat must take its
// "datagrams unsupported" fallback path.

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
const toHex = bytes => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
};

/**
 * @param {number[]} a
 * @param {number[]} b
 */
const arraysEqual = (a, b) =>
  a.length === b.length && a.every((value, i) => value === b[i]);

/**
 * A minimal async FIFO. `take()` resolves with the next queued value,
 * `null` once ended, or rejects once failed.
 *
 * @template T
 */
const makeAsyncQueue = () => {
  /** @type {T[]} */
  const values = [];
  /** @type {{ resolve: (value: T | null) => void, reject: (error: Error) => void }[]} */
  const waiters = [];
  let ended = false;
  /** @type {Error | undefined} */
  let failure;

  const wake = () => {
    while (waiters.length > 0) {
      if (values.length > 0) {
        const waiter = waiters.shift();
        const value = values.shift();
        if (waiter && value !== undefined) waiter.resolve(value);
      } else if (failure !== undefined) {
        const waiter = waiters.shift();
        if (waiter) waiter.reject(failure);
      } else if (ended) {
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(null);
      } else {
        break;
      }
    }
  };

  return {
    /**
     * @param {T} value
     * @returns {boolean} false if the queue no longer accepts values.
     */
    put(value) {
      if (ended || failure !== undefined) return false;
      values.push(value);
      wake();
      return true;
    },
    end() {
      ended = true;
      wake();
    },
    /** @param {Error} error */
    fail(error) {
      if (failure === undefined) failure = error;
      ended = true;
      wake();
    },
    /** @returns {Promise<T | null>} */
    take() {
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
        wake();
      });
    },
  };
};

/**
 * Build one bidirectional stream: two sides, each with a `send` writing
 * into the other side's receive queue and a `recv` draining its own.
 *
 * @param {number} chunkSize
 */
const makeBiPair = chunkSize => {
  /** @type {ReturnType<typeof makeAsyncQueue<Uint8Array>>} */
  const aToB = makeAsyncQueue();
  /** @type {ReturnType<typeof makeAsyncQueue<Uint8Array>>} */
  const bToA = makeAsyncQueue();

  /**
   * @param {typeof aToB} outQueue
   * @param {typeof aToB} inQueue
   */
  const makeSide = (outQueue, inQueue) => {
    /** @type {Uint8Array | undefined} */
    let pending;
    return {
      send: {
        /** @param {number[]} buf */
        async writeAll(buf) {
          await null;
          const bytes = Uint8Array.from(buf);
          // Split into small chunks so netstring reassembly across read
          // boundaries is exercised.
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
            if (!outQueue.put(chunk)) {
              throw Error('mock-iroh: stream is closed');
            }
          }
        },
        async finish() {
          await null;
          outQueue.end();
        },
        /** @param {bigint} _code */
        async reset(_code) {
          await null;
          outQueue.fail(Error('mock-iroh: stream reset by peer'));
        },
      },
      recv: {
        /**
         * @param {number} sizeLimit
         * @returns {Promise<number[]>} Bytes, empty on EOF.
         */
        async read(sizeLimit) {
          await null;
          let chunk = pending;
          pending = undefined;
          if (chunk === undefined) {
            const taken = await inQueue.take();
            if (taken === null) return [];
            chunk = taken;
          }
          if (chunk.length > sizeLimit) {
            pending = chunk.subarray(sizeLimit);
            chunk = chunk.subarray(0, sizeLimit);
          }
          return Array.from(chunk);
        },
      },
    };
  };

  return {
    sides: [makeSide(aToB, bToA), makeSide(bToA, aToB)],
    queues: [aToB, bToA],
  };
};

/**
 * Build a linked pair of mock iroh Connections. Closing either side
 * EOFs every stream in both directions and settles both `closed()`
 * promises, mirroring a QUIC connection close.
 *
 * Each end's `remoteId()` returns the *other* end's EndpointId string,
 * modelling QUIC's mutual authentication: the id a connection reports is
 * the peer's cryptographically-authenticated identity, not a claim.
 *
 * @param {number} chunkSize
 * @param {string} aRemoteId - EndpointId that end A's peer (end B) holds.
 * @param {string} bRemoteId - EndpointId that end B's peer (end A) holds.
 */
const makeLinkedConnections = (chunkSize, aRemoteId, bRemoteId) => {
  const shared = {
    closed: false,
    /** @type {ReturnType<typeof makeAsyncQueue<Uint8Array>>[]} */
    queues: [],
    /** @type {(() => void)[]} */
    closeWaiters: [],
  };
  const closeShared = () => {
    if (shared.closed) return;
    shared.closed = true;
    for (const queue of shared.queues) queue.end();
    for (const wake of shared.closeWaiters) wake();
    shared.closeWaiters.length = 0;
  };

  /** @param {string} remoteIdString */
  const makeEnd = remoteIdString => {
    /** @type {any[]} */
    const biBacklog = [];
    /** @type {((bi: any) => void)[]} */
    const biWaiters = [];
    /** @type {any} */
    let other;
    const end = {
      /** @param {any} otherEnd */
      link(otherEnd) {
        other = otherEnd;
      },
      /** @param {any} bi */
      pushBi(bi) {
        const waiter = biWaiters.shift();
        if (waiter) waiter(bi);
        else biBacklog.push(bi);
      },
      remoteId() {
        return { toString: () => remoteIdString };
      },
      async openBi() {
        await null;
        if (shared.closed) throw Error('mock-iroh: connection is closed');
        const { sides, queues } = makeBiPair(chunkSize);
        shared.queues.push(...queues);
        other.pushBi(sides[1]);
        return sides[0];
      },
      async acceptBi() {
        await null;
        if (biBacklog.length > 0) return biBacklog.shift();
        if (shared.closed) throw Error('mock-iroh: connection is closed');
        return new Promise(resolve => biWaiters.push(resolve));
      },
      /**
       * @param {bigint} _code
       * @param {number[]} _reason
       */
      close(_code, _reason) {
        closeShared();
      },
      closed() {
        return new Promise(resolve => {
          if (shared.closed) resolve(undefined);
          else shared.closeWaiters.push(() => resolve(undefined));
        });
      },
    };
    return end;
  };

  const a = makeEnd(aRemoteId);
  const b = makeEnd(bRemoteId);
  a.link(b);
  b.link(a);
  return [a, b];
};

/**
 * Create an isolated mock iroh "network": endpoints bound through the
 * returned `Endpoint` can only reach each other.
 *
 * @param {object} [options]
 * @param {number} [options.chunkSize] - Wire chunk size for writes.
 */
export const makeMockIroh = ({ chunkSize = 7 } = {}) => {
  /**
   * Per-connector artificial dial latency, keyed by the dialing
   * endpoint's id. Lets a test force the interleaving where an inbound
   * handshake completes while an outbound dial is still in flight.
   * @type {Map<string, number>}
   */
  const connectDelays = new Map();
  /**
   * @type {Map<string, {
   *   alpns: number[][],
   *   incoming: ReturnType<typeof makeAsyncQueue<any>>,
   *   connections: any[],
   *   closed: boolean,
   * }>}
   */
  const registry = new Map();
  let bindCount = 0;

  const EndpointId = {
    /** @param {string} value */
    fromString(value) {
      return { toString: () => value };
    },
  };

  class EndpointAddr {
    /**
     * @param {{ toString: () => string }} id
     * @param {string} [relayUrl]
     * @param {string[]} [addresses]
     */
    constructor(id, relayUrl, addresses) {
      this.id = id;
      this.relayUrl = relayUrl;
      this.addresses = addresses;
    }
  }

  const Endpoint = {
    /**
     * @param {object} options
     * @param {number[]} options.secretKey
     * @param {number[][]} [options.alpns]
     */
    async bind({ secretKey, alpns = [] }) {
      await null;
      if (!Array.isArray(secretKey) || secretKey.length !== 32) {
        throw Error('mock-iroh: secretKey must be a 32-byte Array');
      }
      // A real EndpointId is the Ed25519 public key derived from the
      // secret; the mock only needs a stable, unique, dialable string.
      const id = toHex(Uint8Array.from(secretKey));
      if (registry.has(id)) {
        throw Error(`mock-iroh: endpoint already bound for ${id}`);
      }
      bindCount += 1;
      const directAddress = `127.0.0.1:${4000 + bindCount}`;
      const record = {
        alpns: alpns.map(alpn => Array.from(alpn)),
        /** @type {ReturnType<typeof makeAsyncQueue<any>>} */
        incoming: makeAsyncQueue(),
        /** @type {any[]} */
        connections: [],
        closed: false,
      };
      registry.set(id, record);

      const endpointId = { toString: () => id };
      return {
        id: () => endpointId,
        addr: () => ({
          id: () => endpointId,
          relayUrl: () => null,
          directAddresses: () => [directAddress],
        }),
        /**
         * @param {EndpointAddr} endpointAddr
         * @param {number[]} alpn
         */
        async connect(endpointAddr, alpn) {
          await null;
          const delayMs = connectDelays.get(id) ?? 0;
          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
          if (record.closed) {
            throw Error('mock-iroh: endpoint is closed');
          }
          const targetId = endpointAddr.id.toString();
          const target = registry.get(targetId);
          if (!target || target.closed) {
            throw Error(`mock-iroh: no addressing information for ${targetId}`);
          }
          if (!target.alpns.some(a => arraysEqual(a, Array.from(alpn)))) {
            throw Error('mock-iroh: peer does not speak the requested ALPN');
          }
          // The dialer's connection reports the target's id as its
          // authenticated peer; the target's inbound connection reports
          // the dialer's id.
          const [local, remote] = makeLinkedConnections(
            chunkSize,
            targetId,
            id,
          );
          record.connections.push(local);
          target.connections.push(remote);
          target.incoming.put({
            accept: async () => ({ connect: async () => remote }),
          });
          return local;
        },
        async acceptNext() {
          return record.incoming.take();
        },
        async close() {
          await null;
          if (record.closed) return;
          record.closed = true;
          record.incoming.end();
          for (const connection of record.connections) {
            connection.close(0n, []);
          }
          record.connections.length = 0;
        },
      };
    },
  };

  /**
   * Force the given endpoint's outbound dials to resolve only after
   * `ms` milliseconds, so a test can drive the "inbound handshake
   * completes while our outbound dial is still pending" interleaving.
   *
   * @param {string} endpointId
   * @param {number} ms
   */
  const setConnectDelay = (endpointId, ms) => {
    connectDelays.set(endpointId, ms);
  };

  return { Endpoint, EndpointAddr, EndpointId, setConnectDelay };
};
