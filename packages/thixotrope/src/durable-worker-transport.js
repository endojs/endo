// @ts-check
/* global setTimeout, clearTimeout */
import harden from '@endo/harden';
import { decodeBase64, encodeBase64 } from '@endo/base64';
import { Fail, q } from '@endo/errors';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './worker-engine.js'
 * @import {WorkerStore} from './store-fs.js'
 */

/**
 * The durability envelope of one worker's hub session: the "wire" is
 * the worker engine's duct, the durability is snapshot-keyed frame
 * retention, and the OCapN hub owns all routing. Worker→host frames
 * flow to the `onFrame` callback; host→worker frames enter through
 * `write`.
 *
 * Durability discipline (the same envelope the captp host proved):
 *
 * - Host→worker frames are journaled *before* they reach the duct.
 *   The journal is truncated when a snapshot commits — frames are
 *   retained until subsumed by a snapshot, not until acknowledged.
 * - Wake = start an incarnation from the last snapshot and replay the
 *   journal suffix. The worker deterministically regenerates the
 *   outbound frames that suffix produced. Every outbound frame —
 *   live or regenerated — carries a session-lifetime sequence number
 *   (`outboundBase`, persisted with each snapshot, plus the frame's
 *   index in this incarnation); determinism gives a regenerated frame
 *   the same number, and the hub's inbound watermark (which commits
 *   atomically with the frame's effects) drops duplicates. Exactly
 *   once, with no per-frame metadata write.
 * - A crash without sleep restarts from the snapshot plus the full
 *   journal suffix and re-emits the suffix's frames under their
 *   original numbers, which the hub skips.
 *
 * Sleep parks the incarnation: snapshot, record `{ ref, cut }` (the
 * journal index the snapshot subsumes), advance the outbound base,
 * truncate, terminate. The OCapN session — and every remote reference through
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
 * @param {(bytes: Uint8Array, sequenceNumber: number) => void} options.onFrame
 *   worker→host frames, each with its session-lifetime sequence
 *   number for the hub's inbound watermark
 * @param {number} [options.idleSleepMs] park the worker after this long
 *   with no operations. The XS worker binary drains the engine's
 *   promise-job queue to quiescence after every delivery and workers
 *   have no timer queue, so "no inbound frames for a while" is an
 *   exact dormancy signal, not a heuristic — a worker awaiting a
 *   remote promise parks as heap state and the settlement frame wakes
 *   it. If a future engine surfaces its own dormancy signal, it can
 *   feed this same seam.
 * @param {string} [options.debugLabel]
 */
export const makeDurableWorkerTransport = ({
  workerId,
  store,
  engine,
  onFrame,
  idleSleepMs = undefined,
  debugLabel = undefined,
}) => {
  typeof onFrame === 'function' ||
    Fail`durable worker transport requires an onFrame callback`;
  const debugName = `${debugLabel ?? 'worker'}(${workerId.slice(0, 8)})`;

  let destroyed = false;
  /** @type {WorkerIncarnation | undefined} */
  let incarnation;
  /** Outbound frames seen from the current incarnation, replay included. */
  let seenOutbound = 0;
  /** Outbound frames subsumed by the current snapshot (from meta). */
  let outboundBase = 0;
  /** Absolute journal index of the next host→worker frame to deliver. */
  let deliveredUpTo = 0;
  /**
   * The operation chain: deliveries, wakes, parks, crashes, and
   * retirement all serialize here.
   *
   * @type {Promise<unknown>}
   */
  let chain = Promise.resolve();

  // --- idle-sleep policy ---

  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let idleTimer;
  let opGeneration = 0;

  const noteActivity = () => {
    opGeneration += 1;
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
      idleTimer = undefined;
    }
  };

  const armIdleTimer = () => {
    if (idleSleepMs === undefined || destroyed || incarnation === undefined) {
      return;
    }
    if (idleTimer !== undefined) {
      clearTimeout(idleTimer);
    }
    const generation = opGeneration;
    const timer = setTimeout(() => {
      idleTimer = undefined;
      if (
        destroyed ||
        opGeneration !== generation ||
        incarnation === undefined
      ) {
        return;
      }
      // eslint-disable-next-line no-use-before-define
      sleepInternal().catch(error =>
        console.error(
          `thixotrope worker transport ${debugName}: idle sleep failed`,
          error,
        ),
      );
    }, idleSleepMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    idleTimer = timer;
  };

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
    noteActivity();
    const result = chain.then(operation);
    chain = result.catch(() => {});
    result.then(armIdleTimer, armIdleTimer);
    return result;
  };

  /**
   * The incarnation's engine process died (a delivery or snapshot
   * failed): drop it so the next operation restarts from the snapshot
   * plus the journal suffix instead of wedging on a dead process.
   *
   * @param {unknown} error
   * @returns {never}
   */
  const abandonIncarnation = error => {
    const dying = incarnation;
    incarnation = undefined;
    if (dying !== undefined) {
      Promise.resolve(dying.terminate()).catch(() => {});
    }
    throw error;
  };

  /** @param {any} envelope */
  const processOutboundEnvelope = envelope => {
    if (destroyed) {
      return;
    }
    envelope.t === 'f' ||
      Fail`worker ${q(debugName)}: unexpected duct envelope ${q(envelope.t)}`;
    // Every frame — live or replay-regenerated — is delivered with
    // its session-lifetime sequence number. Determinism gives a
    // regenerated frame the same number it had, and the hub's
    // watermark (atomic with the frame's effects) drops duplicates:
    // exactly once, with no per-frame metadata write here.
    seenOutbound += 1;
    onFrame(decodeBase64(envelope.b64), outboundBase + seenOutbound);
  };

  /** Chain-context only: start an incarnation if none is running. */
  const ensureAwake = async () => {
    !destroyed || Fail`worker ${q(debugName)} transport is closed`;
    if (incarnation !== undefined) {
      return incarnation;
    }
    seenOutbound = 0;
    const meta = store.getMeta();
    outboundBase = meta.outboundBase ?? 0;
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
    try {
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
    } catch (error) {
      abandonIncarnation(error);
    }
    return started;
  };

  const connection = harden({
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
        try {
          await running.deliver(harden({ t: 'f', b64 }));
        } catch (error) {
          // The frame stays in the journal; the wake this failure
          // provokes replays it against a fresh incarnation.
          abandonIncarnation(error);
        }
        deliveredUpTo = index + 1;
      }).catch(error => {
        console.error(
          `thixotrope worker transport ${debugName}: delivery failed`,
          error,
        );
      });
    },
    end: () => {
      destroyed = true;
    },
  });

  /**
   * Park the worker: after the deliveries already queued drain,
   * snapshot, record the snapshot ref and journal cut, reset the
   * outbound watermark, truncate the subsumed journal prefix, and
   * terminate the incarnation. The OCapN session stays live; the
   * next frame wakes the worker.
   */
  const sleepInternal = () =>
    enqueue(async () => {
      if (incarnation === undefined) {
        return;
      }
      if (engine.canSnapshot) {
        const cut = deliveredUpTo;
        /** @type {unknown} */
        let ref;
        try {
          ref = await incarnation.snapshot();
        } catch (error) {
          abandonIncarnation(error);
        }
        const previous = store.getMeta().snapshot?.ref;
        // Record the snapshot before truncating: a crash between the
        // two leaves subsumed entries in the journal, which the next
        // wake skips via the recorded cut. The outbound base advances
        // to the total frames ever emitted: the snapshot subsumes
        // them, so the next incarnation numbers from here.
        outboundBase += seenOutbound;
        seenOutbound = 0;
        store.setMeta({
          ...store.getMeta(),
          snapshot: { ref, cut },
          outboundBase,
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
      const parked = incarnation;
      incarnation = undefined;
      await parked.terminate();
    });

  return harden({
    workerId,
    debugLabel,
    /** One host→worker OCapN frame: journal, then deliver in order. */
    write: (/** @type {Uint8Array} */ bytes) => connection.write(bytes),
    /** Stop accepting frames; deliveries in flight drain. */
    end: () => connection.end(),
    isAwake: () => incarnation !== undefined,
    wake: async () => {
      await enqueue(ensureAwake);
    },
    /** See {@link sleepInternal}, which the idle timer shares. */
    sleep: async () => {
      await sleepInternal();
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
        const dying = incarnation;
        incarnation = undefined;
        await dying.terminate();
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
          const dying = incarnation;
          incarnation = undefined;
          await dying.terminate();
        }
        const ref = store.getMeta().snapshot?.ref;
        if (ref !== undefined && engine.releaseSnapshot) {
          await engine.releaseSnapshot(ref);
        }
      });
    },
  });
};
harden(makeDurableWorkerTransport);
