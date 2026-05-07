// @ts-check
/* global setTimeout, clearTimeout */

/**
 * @typedef {import('./types.js').ByteStream} ByteStream
 * @typedef {import('./types.js').KeyIdHex} KeyIdHex
 * @typedef {import('./types.js').OcapnNoiseNetwork} OcapnNoiseNetwork
 * @typedef {import('./types.js').OcapnNoiseSession} OcapnNoiseSession
 * @typedef {import('./types.js').OcapnNoiseTransport} OcapnNoiseTransport
 * @typedef {import('./types.js').SigningKeys} SigningKeys
 * @typedef {import('./types.js').TransportListener} TransportListener
 * @typedef {import('@endo/ocapn/codec-interface').OcapnCodec} OcapnCodec
 * @typedef {import('@endo/ocapn/components').OcapnLocation} OcapnLocation
 * @typedef {import('@endo/ocapn/components').OcapnSignature} OcapnSignature
 */
/**
 * @template T
 * @typedef {import('@endo/stream').Reader<T>} Reader
 */
/**
 * @template T
 * @typedef {import('@endo/stream').Writer<T>} Writer
 */
/**
 * @template T
 * @typedef {import('@endo/stream').AsyncQueue<T>} AsyncQueue
 */

import harden from '@endo/harden';
import { makeError, q, X } from '@endo/errors';
import { makeQueue } from '@endo/stream';
import { makeCryptography, makeSessionId } from '@endo/ocapn/cryptography';
import {
  readOcapnHandshakeMessage,
  writeOcapnHandshakeMessage,
} from '@endo/ocapn/operations';

// Resolved through the package's own `./platform` subpath so that
// bundlers and runtimes pick the right WASM adapter: Node reads the
// bytes synchronously from disk; browsers fetch and compile. A self
// import by package name lets the conditional `exports` map fire
// instead of locking us to the Node-only path.
// eslint-disable-next-line import/no-unresolved
import { wasmModule, getRandomValues } from '@endo/ocapn-noise/platform';
import {
  makeOcapnSessionCryptography,
  PREFIXED_SYN_LENGTH,
  SYNACK_LENGTH,
} from './bindings.js';
import { compareUint8Arrays } from './bytewise-compare.js';

const CAPTP_VERSION = '1.0';

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
 * @param {string} hex
 * @returns {Uint8Array}
 */
const hexToBytes = hex => {
  if (hex.length % 2 !== 0) throw Error('invalid hex length');
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

/**
 * Return a Uint8Array covering the contents of `buf`. Immutable
 * ArrayBuffers must be sliced before a typed-array view works.
 *
 * @param {ArrayBufferLike} buf
 * @returns {Uint8Array}
 */
const asUint8 = buf =>
  buf instanceof Uint8Array
    ? buf
    : new Uint8Array(/** @type {ArrayBuffer} */ (buf.slice()));

/**
 * Pull one whole message from a message-framed `Reader<Uint8Array>`
 * (the transport applies its own framing: netstring for TCP, WebSocket
 * frames for WS, atomic puts for mock). Any message arriving on a byte
 * stream with no framing is a bug in the transport, not something we
 * paper over here.
 *
 * @param {Reader<Uint8Array>} reader
 * @returns {Promise<Uint8Array>}
 */
const readFrame = async reader => {
  const result = await reader.next(undefined);
  if (result.done) throw Error('stream closed before expected');
  return result.value;
};

/**
 * Assert that a framed message came in at the expected length. Useful
 * for the Noise handshake, where every message has a well-known size.
 *
 * @param {Uint8Array} bytes
 * @param {number} expected
 * @param {string} label
 */
const expectFrameLength = (bytes, expected, label) => {
  if (bytes.length !== expected) {
    throw Error(
      `ocapn-noise: expected ${label} of length ${expected}, got ${bytes.length}`,
    );
  }
};

/** Default per-phase handshake timeout, in milliseconds. */
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 30_000;

/**
 * Cap on how many simultaneous handshakes can be in flight for a given
 * peer. Combined with the handshake timeout, this bounds the work a
 * single misbehaving peer can pin in a responder.
 */
const MAX_IN_PROGRESS_PER_PEER = 8;

/** Maximum number of unconsumed peer-initiated sessions to buffer. */
const MAX_PENDING_INBOUND_SESSIONS = 256;

/**
 * Race a promise against a `setTimeout` firing after `ms`. Returns the
 * promise's value if it settles first; otherwise rejects with a
 * `label`-tagged `Error` and closes the supplied stream so the inner
 * `reader.next()` doesn't keep pulling bytes into a now-dead handshake.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} label - Used in the timeout error message; pick a
 *   noun phrase like `'SYN'` or `'post-handshake greeting'`.
 * @param {ByteStream} [stream] - If provided, its reader and writer are
 *   closed when the timer fires so the abandoned read no longer holds
 *   the byteStream alive.
 * @returns {Promise<T>}
 */
const withTimeout = (promise, ms, label, stream) => {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeoutPromise = /** @type {Promise<T>} */ (
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        if (stream) {
          // Close both halves so the abandoned `reader.next()` settles.
          // Errors are intentionally swallowed: at this point the
          // transport may already be torn down by the peer.
          Promise.resolve(stream.writer.return(undefined)).catch(() => {});
          Promise.resolve(stream.reader.return(undefined)).catch(() => {});
        }
        reject(Error(`ocapn-noise: ${label} timed out after ${ms}ms`));
      }, ms);
    })
  );
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
};

/**
 * Create an OCapN-Noise network. The network starts empty: add signing
 * keys and transports at any point with `addSigningKeys` and
 * `addTransport`.
 *
 * The network loads its own Noise WASM module internally (via the
 * `./wasm/node.js` platform adapter) and hard-codes the one CapTP
 * version currently defined.
 *
 * @param {{
 *   codec: OcapnCodec,
 *   handshakeTimeoutMs?: number,
 * }} options
 * @returns {OcapnNoiseNetwork}
 */
export const makeOcapnNoiseNetwork = ({
  codec,
  handshakeTimeoutMs = DEFAULT_HANDSHAKE_TIMEOUT_MS,
}) => {
  const cryptography = makeCryptography(codec);

  /**
   * @typedef {{
   *   keyId: KeyIdHex,
   *   privateKey: Uint8Array,
   *   publicKey: Uint8Array,
   *   keyPair: ReturnType<typeof cryptography.makeOcapnKeyPairFromPrivateKey>,
   * }} RegisteredKey
   */

  /** @type {Map<KeyIdHex, RegisteredKey>} */
  const registeredKeys = new Map();
  /** @type {Set<OcapnNoiseTransport>} */
  const registeredTransports = new Set();
  /** @type {Map<OcapnNoiseTransport, TransportListener>} */
  const listenersByTransport = new Map();

  /**
   * Crossed-hello state. A pair of peers may independently dial each
   * other and complete two separate Noise handshakes; to keep the rest
   * of the system seeing exactly one session per peer, we compare the
   * two initiators' ephemeral x25519 public keys bytewise and keep the
   * session whose initiator picked the lesser key. Both peers make the
   * same comparison against the same bytes and arrive at the same
   * winner, so no protocol-level coordination is needed.
   *
   * The `inProgress` count gates graduation: a candidate sits in
   * `candidates` until no more handshakes to the same peer are in
   * flight; at that point we compare tiebreakers, close the losers,
   * promote the winner to `active`, and release callers waiting on
   * `waiters`.
   *
   * @typedef {{ session: OcapnNoiseSession, tiebreaker: Uint8Array, close: () => void }} Candidate
   */
  /** @type {Map<KeyIdHex, Candidate>} */
  const active = new Map();
  /** @type {Map<KeyIdHex, Candidate[]>} */
  const candidates = new Map();
  /** @type {Map<KeyIdHex, number>} */
  const inProgress = new Map();
  /**
   * Membership-test wrapper: returns true iff a fresh handshake to
   * `peerId` would push us past `MAX_IN_PROGRESS_PER_PEER`.
   * @param {KeyIdHex} peerId
   */
  const inProgressFull = peerId =>
    (inProgress.get(peerId) ?? 0) >= MAX_IN_PROGRESS_PER_PEER;
  /** @type {Map<KeyIdHex, { resolve: (s: OcapnNoiseSession) => void, reject: (e: Error) => void }[]>} */
  const waiters = new Map();
  /** @type {Map<KeyIdHex, string[]>} */
  const recentErrors = new Map();

  /**
   * Queue of graduated sessions that nobody asked for via
   * `provideSession` (i.e. peer-initiated handshakes). Drained by any
   * consumer iterating `inboundSessions`.
   *
   * @type {import('@endo/stream').AsyncQueue<IteratorResult<OcapnNoiseSession, undefined>>}
   */
  const inboundQueue = makeQueue();
  let inboundClosed = false;

  /**
   * Set true by `shutdown()`. Used by `recordCandidate` and
   * `decrementAndSettle` to avoid promoting a late-arriving candidate
   * into the now-emptied `active` map (where nothing would ever close
   * it again, leaking the underlying socket and WASM cipher state).
   */
  let isShutdown = false;

  /** @param {KeyIdHex} peerId */
  const bumpInProgress = peerId => {
    inProgress.set(peerId, (inProgress.get(peerId) ?? 0) + 1);
  };

  /**
   * @param {KeyIdHex} peerId
   * @param {Candidate} candidate
   */
  const recordCandidate = (peerId, candidate) => {
    if (isShutdown) {
      // Network is shutting down. The candidate's underlying socket
      // and WASM cipher state would otherwise become unreachable
      // through the post-shutdown empty `active` map. Close it now.
      candidate.close();
      return;
    }
    const list = candidates.get(peerId) ?? [];
    list.push(candidate);
    candidates.set(peerId, list);
  };

  /**
   * Cap on how many outstanding errors we keep per peer. A
   * pathological retry loop against one designator would otherwise
   * grow `recentErrors` without bound between successful settlements.
   */
  const MAX_RECENT_ERRORS_PER_PEER = 4;

  /**
   * Record an error against `peerId`. Stores `err.message` strings, not
   * `Error` instances, so a failure path that later surfaces to a
   * waiter does not propagate stack traces (which may include WASM
   * memory views) across security domains.
   *
   * @param {KeyIdHex} peerId
   * @param {Error} err
   */
  const recordError = (peerId, err) => {
    const list = recentErrors.get(peerId) ?? [];
    list.push(err && err.message ? err.message : String(err));
    while (list.length > MAX_RECENT_ERRORS_PER_PEER) list.shift();
    recentErrors.set(peerId, list);
  };

  /**
   * Tracks peer-initiated sessions that are queued for the
   * `inboundSessions` iterable but have not yet been consumed. Bounded
   * by `MAX_PENDING_INBOUND_SESSIONS`; if the embedder never iterates,
   * we close the oldest sessions rather than pinning their transport
   * sockets and WASM cipher state in memory.
   *
   * @type {OcapnNoiseSession[]}
   */
  const pendingInbound = [];

  /** @param {KeyIdHex} peerId */
  const decrementAndSettle = peerId => {
    if (isShutdown) {
      // `shutdown()` already cleared `inProgress`, `candidates`,
      // `active`, and `waiters`, and closed every candidate it knew
      // about. A late-arriving handshake whose own `recordCandidate`
      // call now sees `isShutdown === true` will close itself; nothing
      // here is safe to touch.
      return;
    }
    const next = (inProgress.get(peerId) ?? 0) - 1;
    if (next > 0) {
      inProgress.set(peerId, next);
      return;
    }
    inProgress.delete(peerId);

    const fresh = candidates.get(peerId) ?? [];
    candidates.delete(peerId);
    const existing = active.get(peerId);

    // Crossed-hellos dedup applies only to concurrent initial
    // handshakes. Once a session is already `active`, we do NOT
    // re-evaluate the tiebreaker: any new candidates that arrive later
    // are dropped so the live session is never silently closed out
    // from under the CapTP layer. Waiters that queued while `active`
    // was already set must still be resolved with the live session.
    if (existing) {
      for (const c of fresh) c.close();
      recentErrors.delete(peerId);
      const queue = waiters.get(peerId) ?? [];
      waiters.delete(peerId);
      for (const { resolve } of queue) resolve(existing.session);
      return;
    }

    if (fresh.length === 0) {
      // Every handshake failed. Reject callers with the most recent
      // error message; collapse any earlier ones into AggregateError
      // when there is more than one so callers see them all.
      const errs = recentErrors.get(peerId) ?? [];
      recentErrors.delete(peerId);
      const queue = waiters.get(peerId) ?? [];
      waiters.delete(peerId);
      let reason;
      if (errs.length === 0) {
        reason = Error(`ocapn-noise: handshake failed for ${peerId}`);
      } else if (errs.length === 1) {
        reason = Error(`ocapn-noise: ${errs[0]}`);
      } else {
        reason = Error(
          `ocapn-noise: handshake failed for ${peerId}: ${errs[errs.length - 1]} (after ${errs.length - 1} earlier failure${errs.length > 2 ? 's' : ''})`,
        );
      }
      for (const { reject } of queue) reject(reason);
      return;
    }

    // Pick the candidate whose initiator's ephemeral is lesser.
    let winner = fresh[0];
    for (let i = 1; i < fresh.length; i += 1) {
      if (compareUint8Arrays(fresh[i].tiebreaker, winner.tiebreaker) < 0) {
        winner = fresh[i];
      }
    }
    for (const c of fresh) if (c !== winner) c.close();

    active.set(peerId, winner);
    recentErrors.delete(peerId);

    const queue = waiters.get(peerId) ?? [];
    waiters.delete(peerId);
    if (queue.length > 0) {
      for (const { resolve } of queue) resolve(winner.session);
    } else if (!inboundClosed) {
      // Nobody is waiting on provideSession for this peer; this is a
      // peer-initiated session. Hand it off to the inboundSessions
      // iterable for the embedding client to wire up. If the queue
      // would exceed `MAX_PENDING_INBOUND_SESSIONS`, drop the oldest
      // entry to bound memory under attack.
      if (pendingInbound.length >= MAX_PENDING_INBOUND_SESSIONS) {
        const dropped = pendingInbound.shift();
        if (dropped) dropped.close();
      }
      pendingInbound.push(winner.session);
      inboundQueue.put(harden({ done: false, value: winner.session }));
    }
  };

  /**
   * Forget the active entry for `peerId` if (and only if) it still
   * matches the supplied candidate. Wired into `buildSession.close` so
   * a closed session does not linger as a "live" cache entry that
   * future `provideSession` calls would resurrect.
   *
   * @param {KeyIdHex} peerId
   * @param {Candidate} candidate
   */
  const forgetActive = (peerId, candidate) => {
    if (active.get(peerId) === candidate) {
      active.delete(peerId);
    }
    // Drop any stale recent-error trail; if the peer reconnects, a
    // fresh failure history is more useful than the previous one.
    recentErrors.delete(peerId);
  };

  /**
   * Resolve when an active session for `peerId` is available, or
   * reject when the in-flight handshakes all fail. Used by both
   * `provideSession` (after kicking off `runInitiator`) and
   * `waitForInboundSession`.
   *
   * @param {KeyIdHex} peerId
   */
  const awaitActiveSession = peerId =>
    new Promise((resolve, reject) => {
      const existing = active.get(peerId);
      if (existing && !inProgress.has(peerId)) {
        resolve(existing.session);
        return;
      }
      const list = waiters.get(peerId) ?? [];
      list.push({ resolve, reject });
      waiters.set(peerId, list);
    });

  /**
   * Aggregate the hints from all currently-listening transports into
   * one hints table, prefixed by each transport's scheme.
   *
   * @returns {Record<string, string>}
   */
  const aggregatedHints = () => {
    /** @type {Record<string, string>} */
    const hints = {};
    for (const [transport, listener] of listenersByTransport) {
      for (const [k, v] of Object.entries(listener.hints)) {
        hints[`${transport.scheme}:${k}`] = v;
      }
    }
    return hints;
  };

  /**
   * @param {RegisteredKey} rk
   * @returns {OcapnLocation}
   */
  const buildLocationFor = rk => {
    const hints = aggregatedHints();
    return harden({
      type: /** @type {'ocapn-peer'} */ ('ocapn-peer'),
      network: 'np',
      transport: 'np',
      designator: rk.keyId,
      hints: Object.keys(hints).length > 0 ? { ...hints } : false,
    });
  };

  /**
   * Select a transport for reaching `location` by matching hint prefixes.
   *
   * @param {OcapnLocation} location
   * @returns {{ transport: OcapnNoiseTransport, hints: Record<string, string> }}
   */
  const selectOutgoingTransport = location => {
    const { hints } = location;
    if (!hints || typeof hints !== 'object') {
      throw makeError(
        X`ocapn-noise: location ${q(location.designator)} has no hints`,
      );
    }
    for (const transport of registeredTransports) {
      const prefix = `${transport.scheme}:`;
      /** @type {Record<string, string>} */
      const matching = {};
      for (const [key, value] of Object.entries(hints)) {
        if (key.startsWith(prefix) && typeof value === 'string') {
          matching[key.slice(prefix.length)] = value;
        }
      }
      if (Object.keys(matching).length > 0) {
        return { transport, hints: matching };
      }
    }
    throw makeError(
      X`ocapn-noise: no registered transport matches hints ${q(hints)}`,
    );
  };

  /**
   * Post-handshake `op:start-session` exchange over the encrypted
   * tunnel. Establishes the peer's verified OCapN location signature
   * (needed by three-party handoffs) and binds the peer's ed25519 key
   * to the key Noise authenticated.
   *
   * @param {RegisteredKey} localKey
   * @param {Reader<Uint8Array>} reader
   * @param {Writer<Uint8Array>} writer
   * @param {(bytes: Uint8Array) => Uint8Array} encrypt
   * @param {(bytes: Uint8Array) => Uint8Array} decrypt
   * @param {Uint8Array} peerEd25519
   * @param {Uint8Array} handshakeHash - 32-byte Noise transcript hash
   *   used as the channel-binding value for the location signature so
   *   it cannot be replayed across sessions.
   */
  const exchangeIdentity = async (
    localKey,
    reader,
    writer,
    encrypt,
    decrypt,
    peerEd25519,
    handshakeHash,
  ) => {
    await null;
    const location = buildLocationFor(localKey);
    const locationSignature = cryptography.signLocation(
      location,
      localKey.keyPair,
      handshakeHash.buffer,
    );
    const greeting = writeOcapnHandshakeMessage(
      {
        type: 'op:start-session',
        captpVersion: CAPTP_VERSION,
        sessionPublicKey: localKey.keyPair.publicKey.descriptor,
        location,
        locationSignature,
      },
      codec,
    );
    await writer.next(encrypt(greeting));

    const cipher = await readFrame(reader);
    const plain = decrypt(cipher);
    const msgReader = codec.makeReader(plain);
    const message = readOcapnHandshakeMessage(msgReader);
    if (message.type !== 'op:start-session') {
      throw makeError(
        X`ocapn-noise: expected op:start-session, got ${q(message.type)}`,
      );
    }
    if (message.captpVersion !== CAPTP_VERSION) {
      throw makeError(
        X`ocapn-noise: captp version mismatch ${q(message.captpVersion)} vs ${q(CAPTP_VERSION)}`,
      );
    }
    const peerPublicKey = cryptography.publicKeyDescriptorToPublicKey(
      message.sessionPublicKey,
    );
    const peerBytes = asUint8(peerPublicKey.bytes);
    if (peerBytes.length !== peerEd25519.length) {
      throw makeError(X`ocapn-noise: peer public key length mismatch`);
    }
    // Non-constant-time comparison is safe: both operands are the
    // peer's public key (one from the authenticated Noise handshake,
    // the other from an encrypted `op:start-session` we just
    // received). Neither is a secret; there is nothing for a timing
    // oracle to extract.
    for (let i = 0; i < peerBytes.length; i += 1) {
      if (peerBytes[i] !== peerEd25519[i]) {
        throw makeError(X`ocapn-noise: peer key mismatch with Noise identity`);
      }
    }
    // Bind the peer's advertised location signature to our verified
    // knowledge of their key AND to the Noise handshake transcript so
    // a captured signature cannot be replayed into another session.
    cryptography.assertLocationSignatureValid(
      message.location,
      message.locationSignature,
      peerPublicKey,
      handshakeHash.buffer,
    );
    const advertised = /** @type {OcapnLocation} */ (message.location);
    if (advertised.designator !== toHex(peerEd25519)) {
      throw makeError(
        X`ocapn-noise: advertised designator ${q(advertised.designator)} does not match Noise identity ${q(toHex(peerEd25519))}`,
      );
    }
    return {
      peerLocation: advertised,
      peerLocationSignature: /** @type {OcapnSignature} */ (
        message.locationSignature
      ),
      peerPublicKey,
      location,
      locationSignature,
    };
  };

  /**
   * Build the streaming `NetworkSession` returned from `provideSession`.
   * Each inbound transport frame is one encrypted OCapN message; the
   * session reader decrypts and yields plaintext. The session writer
   * encrypts each outbound message and hands it to the transport as
   * one frame.
   *
   * @param {object} params
   * @param {RegisteredKey} params.localKey
   * @param {OcapnLocation} params.location
   * @param {OcapnSignature} params.locationSignature
   * @param {OcapnLocation} params.peerLocation
   * @param {OcapnSignature} params.peerLocationSignature
   * @param {Uint8Array} params.peerEd25519
   * @param {boolean} params.isInitiator
   * @param {ByteStream} params.stream
   * @param {(bytes: Uint8Array) => Uint8Array} params.encrypt
   * @param {(bytes: Uint8Array) => Uint8Array} params.decrypt
   * @param {() => void} params.onClose - Called when the session closes
   *   (peer disconnect, local `close()`, or stream end). Used by the
   *   network to forget the entry from `active` so a future
   *   `provideSession` does not resurrect a dead session.
   * @returns {OcapnNoiseSession}
   */
  const buildSession = ({
    localKey,
    location,
    locationSignature,
    peerLocation,
    peerLocationSignature,
    peerEd25519,
    isInitiator,
    stream,
    encrypt,
    decrypt,
    onClose,
  }) => {
    let closed = false;
    const fireOnClose = () => {
      try {
        onClose();
      } catch (_e) {
        // never throw out of teardown
      }
    };

    /** @type {Reader<Uint8Array>} */
    const reader = harden({
      next: async () => {
        await null;
        const result = await stream.reader.next(undefined);
        if (result.done) {
          if (!closed) {
            closed = true;
            fireOnClose();
          }
          return harden({ done: true, value: undefined });
        }
        return harden({ done: false, value: decrypt(result.value) });
      },
      return: async () => {
        await null;
        if (!closed) {
          closed = true;
          await stream.writer.return(undefined);
          fireOnClose();
        }
        return harden({ done: true, value: undefined });
      },
      throw: async err => {
        await null;
        if (!closed) {
          closed = true;
          await stream.writer.throw(err);
          fireOnClose();
        }
        throw err;
      },
      [Symbol.asyncIterator]() {
        return reader;
      },
    });

    /** @type {Writer<Uint8Array>} */
    const writer = harden({
      next: async value => {
        await null;
        if (closed) return harden({ done: true, value: undefined });
        await stream.writer.next(encrypt(value));
        return harden({ done: false, value: undefined });
      },
      return: async () => {
        await null;
        if (!closed) {
          closed = true;
          await stream.writer.return(undefined);
          fireOnClose();
        }
        return harden({ done: true, value: undefined });
      },
      throw: async err => {
        await null;
        if (!closed) {
          closed = true;
          await stream.writer.throw(err);
          fireOnClose();
        }
        throw err;
      },
      [Symbol.asyncIterator]() {
        return writer;
      },
    });

    const peerEd25519Buffer = peerEd25519.slice().buffer;
    const sessionId = makeSessionId(
      localKey.keyPair.publicKey.id,
      cryptography.makeOcapnPublicKey(peerEd25519Buffer).id,
    );

    return harden({
      sessionId,
      selfIdentity: {
        location,
        locationSignature,
        keyPair: localKey.keyPair,
        keyId: localKey.keyId,
      },
      remoteLocation: peerLocation,
      remoteLocationSignature: peerLocationSignature,
      remotePublicKeyBytes: peerEd25519Buffer,
      isInitiator,
      reader,
      writer,
      close: () => {
        if (closed) return;
        closed = true;
        // Tear both directions down. We suppress any rejection here
        // because a transport's write half may have already closed.
        Promise.resolve(stream.writer.return(undefined)).catch(() => {});
        Promise.resolve(stream.reader.return(undefined)).catch(() => {});
        fireOnClose();
      },
    });
  };

  /**
   * Extract the initiator's x25519 ephemeral public key from the
   * prefixed SYN. Bytes 0-31 are the intended responder's long-term
   * Ed25519 key; bytes 32-63 are the initiator's per-session x25519
   * ephemeral. The ephemeral is the crossed-hello tiebreaker.
   *
   * @param {Uint8Array} prefixedSyn
   */
  const tiebreakerFromPrefixedSyn = prefixedSyn => prefixedSyn.slice(32, 64);

  /**
   * Drive the initiator side of a single handshake. Does not wait for
   * crossed-hello settlement; the caller is expected to register and
   * settle via the outer state machine.
   *
   * @param {RegisteredKey} localKey
   * @param {OcapnLocation} location
   * @param {Uint8Array} peerEd25519
   * @returns {Promise<{ session: OcapnNoiseSession, tiebreaker: Uint8Array, close: () => void }>}
   */
  const runInitiator = async (localKey, location, peerEd25519) => {
    const { transport, hints } = selectOutgoingTransport(location);
    const stream = await transport.connect(hints);
    const peerId = toHex(peerEd25519);

    try {
      const noise = makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        signingKeys: {
          privateKey: localKey.privateKey,
          publicKey: localKey.publicKey,
        },
      });
      const asInit = noise.asInitiator();
      const prefixedSyn = new Uint8Array(PREFIXED_SYN_LENGTH);
      const { initiatorReadSynack } = asInit.initiatorWriteSyn(
        peerEd25519,
        prefixedSyn,
      );
      const tiebreaker = tiebreakerFromPrefixedSyn(prefixedSyn);
      await stream.writer.next(prefixedSyn);

      const synack = await withTimeout(
        readFrame(stream.reader),
        handshakeTimeoutMs,
        'SYNACK read',
        stream,
      );
      expectFrameLength(synack, SYNACK_LENGTH, 'SYNACK');
      // IK has no message 3 (ACK); reading the SYNACK finalizes the
      // handshake and exposes the transcript hash for channel binding.
      const { encrypt, decrypt, handshakeHash } = initiatorReadSynack(synack);

      const {
        peerLocation,
        peerLocationSignature,
        location: myLocation,
        locationSignature,
      } = await withTimeout(
        exchangeIdentity(
          localKey,
          stream.reader,
          stream.writer,
          encrypt,
          decrypt,
          peerEd25519,
          handshakeHash,
        ),
        handshakeTimeoutMs,
        'post-handshake identity exchange',
        stream,
      );

      /** @type {Candidate | undefined} */
      let candidate;
      const session = buildSession({
        localKey,
        location: myLocation,
        locationSignature,
        peerLocation,
        peerLocationSignature,
        peerEd25519,
        isInitiator: true,
        stream,
        encrypt,
        decrypt,
        onClose: () => {
          if (candidate) forgetActive(peerId, candidate);
        },
      });
      candidate = {
        session,
        tiebreaker,
        close: () => {
          session.close();
        },
      };
      return candidate;
    } catch (err) {
      // The handshake didn't graduate; close both halves of the
      // transport so the kernel doesn't sit on a half-open socket
      // until OS keepalive fires.
      try {
        await stream.writer.return(undefined);
      } catch (_e) {
        // ignore
      }
      try {
        await stream.reader.return(undefined);
      } catch (_e) {
        // ignore
      }
      throw err;
    }
  };

  /**
   * @param {ByteStream} stream
   */
  const handleIncoming = async stream => {
    await null;
    /** @type {KeyIdHex | undefined} */
    let registeredPeerId;
    try {
      const prefixedSyn = await withTimeout(
        readFrame(stream.reader),
        handshakeTimeoutMs,
        'SYN read',
        stream,
      );
      expectFrameLength(prefixedSyn, PREFIXED_SYN_LENGTH, 'SYN');
      const intendedKeyId = toHex(prefixedSyn.subarray(0, 32));
      const localKey = registeredKeys.get(intendedKeyId);
      if (!localKey) {
        await stream.writer.return(undefined);
        return;
      }

      // Cheap-prefix gating: cap concurrent in-progress handshakes
      // per local identity before paying for any Noise IK SYN-decrypt
      // (the per-handshake cost includes a `WebAssembly.Instance`
      // construction and a Diffie-Hellman). The peer's verifying key
      // is encrypted in the SYN payload and not visible until after
      // the decrypt, so we have no source-IP-equivalent identifier
      // here; the per-identity cap bounds the responder's exposure
      // when an attacker spams one of our identities with junk SYNs.
      if (inProgressFull(intendedKeyId)) {
        await stream.writer.return(undefined);
        return;
      }

      const noise = makeOcapnSessionCryptography({
        wasmModule,
        getRandomValues,
        signingKeys: {
          privateKey: localKey.privateKey,
          publicKey: localKey.publicKey,
        },
      });
      const asResp = noise.asResponder();
      const synack = new Uint8Array(SYNACK_LENGTH);
      // IK msg 1 (read) + msg 2 (write) finalize the handshake in
      // one bindings call.  No further wire message is required.
      const { initiatorVerifyingKey, encrypt, decrypt, handshakeHash } =
        asResp.responderReadSynWriteSynack(prefixedSyn, synack);
      const initiatorKeyHex = toHex(initiatorVerifyingKey);
      // Re-check against the verified peer identity now that we know
      // who they really are, in case a single peer is saturating the
      // cap by hitting many of our identities at once.
      if (inProgressFull(initiatorKeyHex)) {
        await stream.writer.return(undefined);
        return;
      }
      registeredPeerId = initiatorKeyHex;
      bumpInProgress(initiatorKeyHex);
      const tiebreaker = tiebreakerFromPrefixedSyn(prefixedSyn);
      await stream.writer.next(synack);

      const {
        peerLocation,
        peerLocationSignature,
        location,
        locationSignature,
      } = await withTimeout(
        exchangeIdentity(
          localKey,
          stream.reader,
          stream.writer,
          encrypt,
          decrypt,
          initiatorVerifyingKey,
          handshakeHash,
        ),
        handshakeTimeoutMs,
        'post-handshake identity exchange',
        stream,
      );

      /** @type {Candidate | undefined} */
      let candidate;
      const session = buildSession({
        localKey,
        location,
        locationSignature,
        peerLocation,
        peerLocationSignature,
        peerEd25519: initiatorVerifyingKey,
        isInitiator: false,
        stream,
        encrypt,
        decrypt,
        onClose: () => {
          if (candidate) forgetActive(initiatorKeyHex, candidate);
        },
      });
      candidate = {
        session,
        tiebreaker,
        close: () => session.close(),
      };

      recordCandidate(initiatorKeyHex, candidate);
      decrementAndSettle(initiatorKeyHex);
    } catch (err) {
      if (registeredPeerId) {
        recordError(registeredPeerId, /** @type {Error} */ (err));
        decrementAndSettle(registeredPeerId);
      }
      try {
        await stream.writer.return(undefined);
      } catch (_e) {
        // ignore
      }
      try {
        await stream.reader.return(undefined);
      } catch (_e) {
        // ignore
      }
    }
  };

  /** @type {OcapnNoiseNetwork['generateSigningKeys']} */
  const generateSigningKeys = () => {
    // Mint fresh 32-byte entropy and derive the Ed25519 public key
    // with the same cryptography helper the rest of the package uses.
    // Avoids spinning up a whole Noise WASM instance whose only
    // side-effect we want is the keypair.
    const privateKey = new Uint8Array(32);
    getRandomValues(privateKey);
    const keyPair = cryptography.makeOcapnKeyPairFromPrivateKey(privateKey);
    const publicKey = new Uint8Array(
      /** @type {ArrayBuffer} */ (keyPair.publicKey.bytes.slice()),
    );
    return { privateKey, publicKey };
  };

  /** @type {OcapnNoiseNetwork['addSigningKeys']} */
  const addSigningKeys = ({ privateKey, publicKey }) => {
    if (privateKey.length !== 32) {
      throw makeError(X`ocapn-noise: privateKey must be 32 bytes`);
    }
    if (publicKey && publicKey.length !== 32) {
      throw makeError(X`ocapn-noise: publicKey must be 32 bytes when supplied`);
    }
    // Always derive the verifying key from the private key so the
    // `keyId` and the bytes handed to the Noise WASM agree. If the
    // caller supplied a public key, assert it matches what we derive
    // (silent disagreement here would let a peer be addressable
    // under one keyId but unable to complete a handshake as that
    // identity, which is a debugging cliff to fall off).
    const keyPair = cryptography.makeOcapnKeyPairFromPrivateKey(privateKey);
    const derivedPublicKey = new Uint8Array(
      /** @type {ArrayBuffer} */ (keyPair.publicKey.bytes.slice()),
    );
    if (publicKey) {
      if (compareUint8Arrays(publicKey, derivedPublicKey) !== 0) {
        throw makeError(
          X`ocapn-noise: supplied publicKey does not match privateKey`,
        );
      }
    }
    const keyId = toHex(derivedPublicKey);
    if (registeredKeys.has(keyId)) return keyId;
    registeredKeys.set(
      keyId,
      harden({
        keyId,
        privateKey,
        publicKey: derivedPublicKey,
        keyPair,
      }),
    );
    return keyId;
  };

  /** @type {OcapnNoiseNetwork['removeSigningKeys']} */
  const removeSigningKeys = keyId => {
    registeredKeys.delete(keyId);
  };

  /** @type {OcapnNoiseNetwork['addTransport']} */
  const addTransport = async transport => {
    await null;
    if (registeredTransports.has(transport)) return;
    // Refuse a second transport with the same scheme: outgoing
    // dial selection iterates `registeredTransports` and returns the
    // first hint match, so a second `tcp` transport would be
    // silently shadowed; aggregated hints would also silently
    // overwrite each other.
    for (const t of registeredTransports) {
      if (t.scheme === transport.scheme) {
        throw makeError(
          X`ocapn-noise: a transport with scheme ${q(transport.scheme)} is already registered`,
        );
      }
    }
    if (transport.listen) {
      // Call `listen` first so a failure can't leave a half-registered
      // transport behind; only add to the set once the listener is
      // live.
      const listener = await transport.listen(stream => handleIncoming(stream));
      registeredTransports.add(transport);
      listenersByTransport.set(transport, listener);
    } else {
      registeredTransports.add(transport);
    }
  };

  /** @type {OcapnNoiseNetwork['removeTransport']} */
  const removeTransport = transport => {
    const listener = listenersByTransport.get(transport);
    if (listener) {
      listener.close();
      listenersByTransport.delete(transport);
    }
    registeredTransports.delete(transport);
  };

  /** @type {OcapnNoiseNetwork['locations']} */
  const locations = () =>
    [...registeredKeys.values()].map(rk => buildLocationFor(rk));

  /** @type {OcapnNoiseNetwork['locationFor']} */
  const locationFor = keyId => {
    const rk = registeredKeys.get(keyId);
    if (!rk) throw makeError(X`ocapn-noise: unknown keyId ${q(keyId)}`);
    return buildLocationFor(rk);
  };

  /**
   * @type {OcapnNoiseNetwork['provideSession']}
   * @param {OcapnLocation} remote
   * @param {{ localKeyId?: KeyIdHex }} [options]
   */
  const provideSession = async (remote, { localKeyId } = {}) => {
    if (registeredKeys.size === 0) {
      throw makeError(
        X`ocapn-noise: provideSession requires at least one signing key`,
      );
    }
    if (localKeyId === undefined && registeredKeys.size > 1) {
      throw makeError(
        X`ocapn-noise: provideSession requires \`localKeyId\` when ${q(registeredKeys.size)} keys are registered (pass \`{ localKeyId: '<64-hex>' }\`)`,
      );
    }
    const rk = localKeyId
      ? registeredKeys.get(localKeyId)
      : registeredKeys.values().next().value;
    if (!rk) {
      throw makeError(X`ocapn-noise: unknown local keyId ${q(localKeyId)}`);
    }
    if (remote.designator.length !== 64) {
      throw makeError(
        X`ocapn-noise: peer designator must be a 32-byte Ed25519 key (got ${q(remote.designator.length)} chars)`,
      );
    }
    const peerId = remote.designator;
    const peerEd25519 = hexToBytes(peerId);

    // If we already have an active session for this peer, reuse it
    // even if a stray inbound handshake is currently in flight: the
    // settlement code routes that handshake to the loser path and
    // resolves any waiters with the live session. Spawning another
    // outbound dial would just produce a second candidate that the
    // same code path will close.
    //
    // The cached session must have been established under the same
    // local identity the caller asked for. Returning a session whose
    // `selfIdentity.keyId` differs would silently swap the caller's
    // identity. Reject loudly so the caller knows the active map is
    // keyed by peer alone and they are competing with another local
    // identity for the same peer.
    const existing = active.get(peerId);
    if (existing) {
      if (existing.session.selfIdentity.keyId !== rk.keyId) {
        throw makeError(
          X`ocapn-noise: peer ${q(peerId)} already has an active session under local keyId ${q(existing.session.selfIdentity.keyId)}; cannot open a second session under ${q(rk.keyId)} (the active map is keyed by peer)`,
        );
      }
      return existing.session;
    }

    // Register our handshake, kick it off in the background, and
    // wait for settlement: either our own handshake graduates, or a
    // concurrent inbound handshake (crossed hello) wins.
    bumpInProgress(peerId);
    runInitiator(rk, remote, peerEd25519)
      .then(candidate => {
        recordCandidate(peerId, candidate);
        decrementAndSettle(peerId);
      })
      .catch(err => {
        recordError(peerId, /** @type {Error} */ (err));
        decrementAndSettle(peerId);
      });
    return awaitActiveSession(peerId);
  };

  /** @type {OcapnNoiseNetwork['waitForInboundSession']} */
  const waitForInboundSession = peerKeyId => {
    const existing = active.get(peerKeyId);
    if (existing) return Promise.resolve(existing.session);
    return awaitActiveSession(peerKeyId);
  };

  const shutdown = () => {
    // Idempotent: a second call (often from a `t.teardown` overlapping
    // an explicit test-body `shutdown()`) is a no-op rather than
    // putting a second `done: true` on `inboundQueue` and rebumping
    // any already-released listener.
    if (isShutdown) return;
    // Set the flag first so any `runInitiator` or `handleIncoming`
    // that resolves while we are tearing down sees the network is
    // shutting down and closes its candidate rather than writing it
    // into a now-empty `active` map.
    isShutdown = true;
    // Reject any still-waiting provideSession callers first so their
    // promises settle before we tear down transports beneath them.
    const shutdownReason = Error('ocapn-noise: network shutdown');
    for (const [, queue] of waiters) {
      for (const { reject } of queue) reject(shutdownReason);
    }
    waiters.clear();
    inProgress.clear();
    // Close any candidates that recorded themselves between
    // `runInitiator` resolution and `decrementAndSettle`. After this
    // sweep, future `recordCandidate` calls short-circuit on
    // `isShutdown` and close their candidate inline.
    for (const [, list] of candidates) {
      for (const c of list) c.close();
    }
    candidates.clear();
    recentErrors.clear();
    for (const [, c] of active) c.close();
    active.clear();
    // Close any sessions queued for `inboundSessions` that nobody
    // ever consumed. Without this they hold their underlying socket
    // and WASM cipher state until the process exits.
    while (pendingInbound.length > 0) {
      const s = pendingInbound.shift();
      if (s) s.close();
    }
    for (const [, listener] of listenersByTransport) listener.close();
    listenersByTransport.clear();
    for (const transport of registeredTransports) transport.shutdown();
    registeredTransports.clear();
    registeredKeys.clear();
    inboundClosed = true;
    inboundQueue.put(harden({ done: true, value: undefined }));
  };

  /** @type {AsyncIterable<OcapnNoiseSession>} */
  const inboundSessions = harden({
    [Symbol.asyncIterator]() {
      return harden({
        next: async () => {
          const result = await inboundQueue.get();
          if (!result.done) {
            // The session has been handed off to the consumer; drop
            // our tracking entry so it can no longer be evicted by
            // the drop-oldest cap.
            const idx = pendingInbound.indexOf(result.value);
            if (idx !== -1) pendingInbound.splice(idx, 1);
          }
          return result;
        },
        async return() {
          // Stop accepting further inbound sessions and close any
          // queued ones the consumer never pulled. This is the only
          // signal we have that the embedder no longer wants the
          // stream; without it, sessions accumulated in
          // `pendingInbound` would pin sockets indefinitely.
          inboundClosed = true;
          while (pendingInbound.length > 0) {
            const s = pendingInbound.shift();
            if (s) s.close();
          }
          return harden({ done: true, value: undefined });
        },
        async throw(err) {
          inboundClosed = true;
          while (pendingInbound.length > 0) {
            const s = pendingInbound.shift();
            if (s) s.close();
          }
          throw err;
        },
      });
    },
  });

  return harden({
    networkId: 'np',
    codec,
    inboundSessions,
    generateSigningKeys,
    addSigningKeys,
    removeSigningKeys,
    listSigningKeys: () => [...registeredKeys.keys()],
    addTransport,
    removeTransport,
    listTransports: () => [...registeredTransports],
    locations,
    locationFor,
    provideSession,
    waitForInboundSession,
    shutdown,
  });
};
