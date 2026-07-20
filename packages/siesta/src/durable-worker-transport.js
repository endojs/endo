// @ts-check
import harden from '@endo/harden';
import { decodeBase64, encodeBase64 } from '@endo/base64';
import { Fail, q } from '@endo/errors';

import { derivePipeResumption } from './pipe-network.js';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './host.js'
 * @import {WorkerStore} from './store-fs.js'
 */

/**
 * The host end of a worker session as a durable OCapN transport
 * (protocol unification phase 3): one worker = one OCapN session on
 * the daemon's client, whose "wire" is the worker engine's duct and
 * whose durability is snapshot-keyed frame retention.
 *
 * The session is established through the `resumeSession` netlayer
 * seam — never a wire handshake. Both identities and the session id
 * derive deterministically from the worker id
 * ({@link derivePipeResumption}), so establishment is the *same
 * operation* for a fresh worker, a wake from snapshot, and a daemon
 * restart: nothing about the session's identity is persisted because
 * nothing about it is contingent.
 *
 * Durability discipline (the same envelope the captp host proved):
 *
 * - Host→worker frames are journaled *before* they reach the duct.
 *   The journal is truncated when a snapshot commits — frames are
 *   retained until subsumed by a snapshot, not until acknowledged.
 * - Wake = start an incarnation from the last snapshot and replay the
 *   journal suffix. The worker deterministically regenerates the
 *   outbound frames that suffix produced; the host counts outbound
 *   frames since the snapshot (`outboundSinceSnapshot`, persisted
 *   *before* each frame is processed) and discards regenerated frames
 *   up to that watermark.
 * - A crash without sleep restarts from the snapshot plus the full
 *   journal suffix; a crash between the watermark write and the frame
 *   dispatch loses that frame — at-most-once, never twice.
 *
 * Sleep parks the incarnation: snapshot, record `{ ref, cut }` (the
 * journal index the snapshot subsumes), reset the watermark, truncate,
 * terminate. The OCapN session — and every remote reference through
 * it — stays live; the next inbound frame wakes the worker.
 *
 * Every incarnation-touching operation — frame delivery, wake, park,
 * crash, retirement — is serialized on one operation chain, so a park
 * naturally drains the deliveries queued before it, and deliveries
 * queued after it reopen the worker from the snapshot it just took.
 *
 * @param {object} options
 * @param {string} options.workerId
 * @param {WorkerStore} options.store
 * @param {WorkerEngine} options.engine
 * @param {any} options.handlers the daemon OCapN client's netlayer
 *   handlers (captured by its network factory)
 * @param {any} options.codec
 * @param {string} [options.debugLabel]
 */
export const makeDurableWorkerTransport = ({
  workerId,
  store,
  engine,
  handlers,
  codec,
  debugLabel = undefined,
}) => {
  typeof handlers.resumeSession === 'function' ||
    Fail`durable worker transport requires the resumeSession netlayer seam`;
  const resumption = derivePipeResumption({ codec, workerId, role: 'host' });
  const debugName = `${debugLabel ?? 'worker'}(${workerId.slice(0, 8)})`;

  let destroyed = false;
  /** @type {WorkerIncarnation | undefined} */
  let incarnation;
  /** Outbound frames seen from the current incarnation, replay included. */
  let seenOutbound = 0;
  /** Absolute journal index of the next host→worker frame to deliver. */
  let deliveredUpTo = 0;
  /**
   * The operation chain: deliveries, wakes, parks, crashes, and
   * retirement all serialize here.
   *
   * @type {Promise<unknown>}
   */
  let chain = Promise.resolve();

  /** @type {any} */
  let connection;

  /**
   * Enqueue an incarnation-touching operation. The returned promise
   * settles with the operation; the chain itself swallows rejections
   * (each operation's failure is its caller's to observe or log,
   * never the next operation's).
   *
   * @template T
   * @param {() => Promise<T>} operation
   * @returns {Promise<T>}
   */
  const enqueue = operation => {
    const result = chain.then(operation);
    chain = result.catch(() => {});
    return result;
  };

  /** @param {any} envelope */
  const processOutboundEnvelope = envelope => {
    if (destroyed) {
      return;
    }
    envelope.t === 'f' ||
      Fail`worker ${q(debugName)}: unexpected duct envelope ${q(envelope.t)}`;
    const meta = store.getMeta();
    const watermark = meta.outboundSinceSnapshot ?? 0;
    if (seenOutbound < watermark) {
      // Replay regenerated a frame a previous incarnation already
      // emitted and the host already processed; determinism makes
      // count-dedup sound.
      seenOutbound += 1;
      return;
    }
    // At-most-once: persist the watermark before dispatching, so a
    // crash between the two loses the frame rather than replaying it
    // into the (non-replayable) host session state twice.
    store.setMeta({ ...meta, outboundSinceSnapshot: seenOutbound + 1 });
    seenOutbound += 1;
    handlers.handleMessageData(connection, decodeBase64(envelope.b64));
  };

  /** Chain-context only: start an incarnation if none is running. */
  const ensureAwake = async () => {
    !destroyed || Fail`worker ${q(debugName)} transport is closed`;
    if (incarnation !== undefined) {
      return incarnation;
    }
    seenOutbound = 0;
    const meta = store.getMeta();
    const snapshotRef = meta.snapshot?.ref ?? null;
    const cut = meta.snapshot?.cut ?? 0;
    const started = await engine.start({
      debugName,
      snapshot: snapshotRef,
      onOutbound: processOutboundEnvelope,
    });
    // Awake from the moment the process runs: replies to replayed
    // frames can reach userland before the replay loop returns, and an
    // observer reacting to one must see the worker awake.
    incarnation = started;
    if (snapshotRef === null) {
      // The peer boots from the init message on first incarnation (or
      // on every incarnation for replay engines without snapshots);
      // restored heaps already contain the booted peer.
      await started.deliver(harden({ t: 'init', workerId, debugLabel }));
    }
    const entries = store.readJournal(cut);
    deliveredUpTo = cut;
    for (const b64 of entries) {
      // eslint-disable-next-line no-await-in-loop
      await started.deliver(harden({ t: 'f', b64 }));
      deliveredUpTo += 1;
    }
    return started;
  };

  connection = harden({
    // Never consulted on the resumeSession path; present for shape.
    netlayer: harden({ location: resumption.peerLocation }),
    isOutgoing: true,
    get isDestroyed() {
      return destroyed;
    },
    /** @param {Uint8Array} bytes one OCapN frame toward the worker */
    write: bytes => {
      if (destroyed) {
        return;
      }
      const b64 = encodeBase64(bytes);
      const index = store.journalLength();
      // Journal before the duct: a frame the OCapN layer believes it
      // sent must survive any crash from here on.
      store.appendJournal(b64);
      enqueue(async () => {
        if (destroyed) {
          return;
        }
        const running = await ensureAwake();
        if (index < deliveredUpTo) {
          // The wake replay already delivered this frame from the
          // journal.
          return;
        }
        index === deliveredUpTo ||
          Fail`worker ${q(debugName)}: journal delivery out of order`;
        await running.deliver(harden({ t: 'f', b64 }));
        deliveredUpTo = index + 1;
      }).catch(error => {
        console.error(
          `siesta worker transport ${debugName}: delivery failed`,
          error,
        );
      });
    },
    end: () => {
      destroyed = true;
    },
  });

  /** @type {any} */
  let resumed;

  return harden({
    workerId,
    debugLabel,
    peerLocation: resumption.peerLocation,
    /**
     * Register the worker session with the OCapN client — same call
     * whether the worker is brand new or restored after a daemon
     * restart. Returns the narrow restore controls for re-seating
     * exports recorded in a session record.
     */
    establish: () => {
      resumed === undefined ||
        Fail`worker ${q(debugName)} session already established`;
      resumed = handlers.resumeSession(connection, resumption);
      return resumed;
    },
    isAwake: () => incarnation !== undefined,
    wake: async () => {
      await enqueue(ensureAwake);
    },
    /**
     * Park the worker: after the deliveries already queued drain,
     * snapshot, record the snapshot ref and journal cut, reset the
     * outbound watermark, truncate the subsumed journal prefix, and
     * terminate the incarnation. The OCapN session stays live; the
     * next frame wakes the worker.
     */
    sleep: async () => {
      await enqueue(async () => {
        if (incarnation === undefined) {
          return;
        }
        if (engine.canSnapshot) {
          const cut = deliveredUpTo;
          const ref = await incarnation.snapshot();
          const previous = store.getMeta().snapshot?.ref;
          // Record the snapshot before truncating: a crash between the
          // two leaves subsumed entries in the journal, which the next
          // wake skips via the recorded cut.
          store.setMeta({
            ...store.getMeta(),
            snapshot: { ref, cut },
            outboundSinceSnapshot: 0,
          });
          store.truncateJournal(cut);
          if (
            previous !== undefined &&
            previous !== ref &&
            engine.releaseSnapshot
          ) {
            await engine.releaseSnapshot(previous);
          }
        }
        await incarnation.terminate();
        incarnation = undefined;
      });
    },
    /**
     * Simulate worker-process death: terminate the incarnation with no
     * snapshot. The next delivery wakes the worker by replaying the
     * journal suffix — the crash-recovery path.
     */
    crash: async () => {
      await enqueue(async () => {
        if (incarnation === undefined) {
          return;
        }
        await incarnation.terminate();
        incarnation = undefined;
      });
    },
    /**
     * Permanently destroy the worker: terminate, release its snapshot,
     * and abort the OCapN session so every import from it breaks.
     */
    retire: async () => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      await enqueue(async () => {
        if (incarnation !== undefined) {
          await incarnation.terminate();
          incarnation = undefined;
        }
        const ref = store.getMeta().snapshot?.ref;
        if (ref !== undefined && engine.releaseSnapshot) {
          await engine.releaseSnapshot(ref);
        }
      });
      handlers.handleConnectionClose(
        connection,
        Error(`worker ${debugName} has been retired`),
      );
    },
  });
};
harden(makeDurableWorkerTransport);
