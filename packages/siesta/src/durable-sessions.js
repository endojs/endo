// @ts-check
import harden from '@endo/harden';
import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { Fail } from '@endo/errors';
import { Far } from '@endo/far';

import { isSessionToken } from './store-fs.js';

/**
 * Durable OCapN sessions, layer 2: the embedder glue that lets a
 * siesta daemon's sessions survive a process restart.
 *
 * The durable netlayer owns frame-level durability (watermarks and the
 * outbound frame journal, persisted through the `resumption` power
 * below). This module owns session-level durability:
 *
 * - `sessionHooks` (for `makeOcapn`) captures each session's identity
 *   when it establishes and a durable description of every export the
 *   session makes, keyed by the netlayer's resume token;
 * - `resumption.restoreSession` rebuilds the session in a fresh
 *   process via `handlers.resumeSession` (same session id, no
 *   handshake) and re-seats every described export at its recorded
 *   position through the host's capability linkage seam — without
 *   waking any worker.
 *
 * Exports with no durable description (e.g. session-internal resolver
 * objects) are re-seated as inert tombstones so the position space
 * stays aligned with the peer; calls to them fail loudly.
 *
 * @import {SiestaStore} from './store-fs.js'
 * @import {SiestaHost} from './host.js'
 */

/** @param {ArrayBufferLike | Uint8Array} value OCapN identity fields are
 *   endo immutable ArrayBuffers; view them before encoding */
const encodeHex = value =>
  Array.from(
    value instanceof Uint8Array ? value : bytesFromImmutable(value),
    byte => byte.toString(16).padStart(2, '0'),
  ).join('');

/** @param {string} hex */
const decodeHexToUint8 = hex => {
  (typeof hex === 'string' &&
    hex.length % 2 === 0 &&
    /^[0-9a-f]*$/.test(hex)) ||
    Fail`invalid hex`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
};

/** @param {string} hex */
const decodeHexToBuffer = hex => {
  (typeof hex === 'string' &&
    hex.length % 2 === 0 &&
    /^[0-9a-f]*$/.test(hex)) ||
    Fail`invalid hex`;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  // The OCapN codecs expect endo immutable ArrayBuffers, matching the
  // shapes the handshake decoder originally produced.
  return bytesToImmutable(bytes);
};

const serializeSignature = signature =>
  harden({
    r: encodeHex(signature.r),
    s: encodeHex(signature.s),
  });

const deserializeSignature = serialized =>
  harden({
    type: 'sig-val',
    scheme: 'eddsa',
    r: decodeHexToBuffer(serialized.r),
    s: decodeHexToBuffer(serialized.s),
  });

const base64FromBytes = bytes => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // eslint-disable-next-line no-undef
  return btoa(binary);
};

const bytesFromBase64 = b64 => {
  // eslint-disable-next-line no-undef
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * @param {object} options
 * @param {SiestaStore} options.store
 * @param {SiestaHost} options.host
 * @param {(error: unknown) => void} [options.reportError]
 */
export const makeDurableSessions = ({
  store,
  host,
  // eslint-disable-next-line no-console
  reportError = error => console.error('siesta durable sessions:', error),
}) => {
  /**
   * Late-bound: the durable netlayer resolves after `makeOcapn` has
   * already consumed `sessionHooks`. Hooks read it at fire time, by
   * which point the daemon has bound it.
   *
   * @type {{ netlayer: { getResumeToken: (connection: object) => string | undefined } | undefined }}
   */
  const netlayerRef = { netlayer: undefined };

  /** @param {object} connection */
  const tokenForConnection = connection => {
    const { netlayer } = netlayerRef;
    if (netlayer === undefined || netlayer.getResumeToken === undefined) {
      return undefined;
    }
    return netlayer.getResumeToken(connection);
  };

  const sessionHooks = harden({
    onSessionEstablished: (connection, info) => {
      const token = tokenForConnection(connection);
      if (token === undefined) {
        return;
      }
      try {
        const sessionStore = store.provideSessionStore(token);
        sessionStore.setMeta({
          ...sessionStore.getMeta(),
          sessionId: encodeHex(info.sessionId),
          peerLocation: info.peerLocation,
          peerLocationSignature: serializeSignature(info.peerLocationSignature),
          peerPublicKey: encodeHex(info.peerPublicKeyBytes),
          // The session's own private key: a resumed session keeps the
          // SAME keys, so handoff signatures made before a restart
          // keep verifying after it.
          ...(info.selfPrivateKeyBytes !== undefined
            ? { selfPrivateKey: encodeHex(info.selfPrivateKeyBytes) }
            : {}),
        });
      } catch (error) {
        reportError(error);
      }
    },
    onExport: (connection, slot, value) => {
      const token = tokenForConnection(connection);
      if (token === undefined) {
        return;
      }
      try {
        // Position 0 is the bootstrap object, recreated by every
        // session; later positions must be re-seatable.
        if (slot.endsWith('+0')) {
          return;
        }
        const description = host.describeCapability(value) ?? null;
        if (description === null) {
          // The machine's invariant is that every session export is a
          // durable worker capability or a host resource; protocol
          // resolvers are persisted separately as obligations. An
          // undescribable export survives restarts only as a loudly
          // failing tombstone — report it when it happens, not when
          // it bites.
          reportError(
            Error(
              `siesta durable sessions: export at ${slot} has no durable description`,
            ),
          );
        }
        const sessionStore = store.provideSessionStore(token);
        const meta = sessionStore.getMeta();
        sessionStore.setMeta({
          ...meta,
          exports: { ...meta.exports, [slot]: description },
        });
      } catch (error) {
        reportError(error);
      }
    },
    onPendingResolver: (connection, resolverSlot, target) => {
      const token = tokenForConnection(connection);
      if (token === undefined) {
        return;
      }
      try {
        const sessionStore = store.provideSessionStore(token);
        const meta = sessionStore.getMeta();
        sessionStore.setMeta({
          ...meta,
          pendingResolvers: {
            ...meta.pendingResolvers,
            [resolverSlot]: {
              kind: target.kind,
              position: target.position.toString(),
            },
          },
        });
      } catch (error) {
        reportError(error);
      }
    },
    onResolverSettled: (connection, resolverSlot) => {
      const token = tokenForConnection(connection);
      if (token === undefined) {
        return;
      }
      try {
        const sessionStore = store.provideSessionStore(token);
        const meta = sessionStore.getMeta();
        if (meta.pendingResolvers && resolverSlot in meta.pendingResolvers) {
          const pendingResolvers = { ...meta.pendingResolvers };
          delete pendingResolvers[resolverSlot];
          sessionStore.setMeta({ ...meta, pendingResolvers });
        }
      } catch (error) {
        reportError(error);
      }
    },
  });

  /** @type {import('./durable-netlayer.js').SessionResumptionPower} */
  const resumption = harden({
    isDurableToken: token => isSessionToken(token),
    onHello: token => {
      // A fresh logical connection: reset any stale record under this
      // token (an unguessable collision is a reused token, not a peer).
      store.deleteSession(token);
      store.provideSessionStore(token).setMeta({});
    },
    loadForResume: token => {
      if (!store.listSessionTokens().includes(token)) {
        return undefined;
      }
      const sessionStore = store.provideSessionStore(token);
      const meta = sessionStore.getMeta();
      if (meta.sessionId === undefined) {
        // The session never established; nothing to resume.
        return undefined;
      }
      return {
        recvSeq: meta.recvSeq ?? 0,
        sendSeq: meta.sendSeq ?? 0,
        frames: sessionStore
          .readFrames()
          .map(({ n, b64 }) => ({ n, bytes: bytesFromBase64(b64) })),
      };
    },
    restoreSession: (handlers, connection, token) => {
      const sessionStore = store.provideSessionStore(token);
      const meta = sessionStore.getMeta();
      meta.sessionId !== undefined ||
        Fail`no session identity recorded for resumption`;
      const { resumeSession } = handlers;
      if (resumeSession === undefined) {
        throw Fail`the OCapN layer does not support session resumption`;
      }
      const resumed = resumeSession(connection, {
        sessionId: decodeHexToBuffer(meta.sessionId),
        peerLocation: meta.peerLocation,
        peerLocationSignature: deserializeSignature(meta.peerLocationSignature),
        peerPublicKeyBytes: decodeHexToBuffer(meta.peerPublicKey),
        ...(meta.selfPrivateKey !== undefined
          ? { selfPrivateKeyBytes: decodeHexToUint8(meta.selfPrivateKey) }
          : {}),
      });
      for (const [slot, description] of Object.entries(meta.exports ?? {})) {
        const position = BigInt(slot.slice(2));
        if (description === null) {
          // No durable description was available at export time. Seat
          // a tombstone so the position space stays aligned; calls to
          // it fail loudly.
          resumed.restoreExport(position, Far('UnrestorableExport', {}));
        } else {
          resumed.restoreExport(position, host.provideCapability(description));
        }
      }
      // Re-attach resolver obligations: promise targets re-subscribe
      // the peer's resolver to the restored durable promise export;
      // answer targets reject at-most-once (the computation died with
      // the previous process) — the peer sees a rejection, never a
      // hang.
      for (const [resolverSlot, target] of Object.entries(
        meta.pendingResolvers ?? {},
      )) {
        resumed.restorePendingResolver({
          resolverPosition: BigInt(resolverSlot.slice(2)),
          target: {
            kind: target.kind,
            position: BigInt(target.position),
          },
        });
      }
    },
    recordOutbound: (token, n, bytes) => {
      const sessionStore = store.provideSessionStore(token);
      sessionStore.appendFrame({ n, b64: base64FromBytes(bytes) });
      sessionStore.setMeta({ ...sessionStore.getMeta(), sendSeq: n });
    },
    recordAck: (token, n) => {
      store.provideSessionStore(token).truncateFramesUpTo(n);
    },
    recordInbound: (token, n) => {
      const sessionStore = store.provideSessionStore(token);
      sessionStore.setMeta({ ...sessionStore.getMeta(), recvSeq: n });
    },
    onEnd: token => {
      store.deleteSession(token);
    },
  });

  return harden({
    sessionHooks,
    resumption,
    /** @param {any} netlayer */
    setNetlayer: netlayer => {
      netlayerRef.netlayer = netlayer;
    },
  });
};
harden(makeDurableSessions);
