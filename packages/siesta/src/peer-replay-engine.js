// @ts-check
/* global setTimeout */
import harden from '@endo/harden';
import { decodeBase64, encodeBase64 } from '@endo/base64';
import { Fail, q } from '@endo/errors';

import { makeWorkerPeer } from './worker-peer.js';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './host.js'
 */

/**
 * In-process {@link WorkerEngine} doubles that host the OCapN worker
 * peer (`worker-peer.js`) instead of the captp worker shell — the
 * protocol-unified mirrors of `journal-replay-engine.js`. They speak
 * the same duct envelopes as the XS peer bundle
 * (`{ t: 'init', workerId }` then `{ t: 'f', b64 }`), so the durable
 * worker transport cannot tell them from `makeXsEngine` running
 * `dist-xs/worker-peer.js`. Test doubles for the host's persistence
 * logic; deliberately not part of the public API.
 */

const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * @param {object} options
 * @param {string} options.debugName
 * @param {(envelope: Record<string, unknown>) => void} options.onOutbound
 */
const makePeerIncarnation = ({ debugName, onOutbound }) => {
  let alive = true;
  let suppressed = false;
  let activity = 0;
  /** @type {{ deliver: (bytes: Uint8Array) => void, shutdown: () => void } | undefined} */
  let peer;

  // Emulate the XS binary's quiesce: run the delivery's job chain to
  // completion — until no further outbound activity appears across two
  // consecutive macrotasks — so its frames are emitted (or suppressed)
  // before the delivery acks.
  const drainUntilQuiet = async () => {
    for (;;) {
      const seen = activity;
      // eslint-disable-next-line no-await-in-loop
      await macrotask();
      // eslint-disable-next-line no-await-in-loop
      await macrotask();
      if (activity === seen) {
        return;
      }
    }
  };

  /** @param {Record<string, any>} envelope */
  const deliverOne = async envelope => {
    alive || Fail`worker ${q(debugName)} incarnation has been terminated`;
    if (envelope.t === 'init') {
      peer === undefined || Fail`worker ${q(debugName)}: duplicate init`;
      peer = await makeWorkerPeer({
        workerId: /** @type {string} */ (envelope.workerId),
        debugLabel: /** @type {string | undefined} */ (envelope.debugLabel),
        send: frame => {
          activity += 1;
          if (alive && !suppressed) {
            onOutbound(harden({ t: 'f', b64: encodeBase64(frame) }));
          }
        },
      });
    } else if (envelope.t === 'f') {
      const bootedPeer = peer;
      if (bootedPeer === undefined) {
        throw Fail`worker ${q(debugName)}: frame before init`;
      }
      bootedPeer.deliver(decodeBase64(/** @type {string} */ (envelope.b64)));
    } else {
      Fail`worker ${q(debugName)}: unknown duct envelope ${q(envelope.t)}`;
    }
    await drainUntilQuiet();
  };

  return harden({
    /** @param {boolean} value */
    setSuppressed: value => {
      suppressed = value;
    },
    deliverOne,
    kill: () => {
      alive = false;
      peer?.shutdown();
    },
  });
};

/**
 * The no-snapshot mirror of `makeJournalReplayEngine`: every wake
 * replays the full journal (init included) into a fresh worker peer.
 * The transport's outbound watermark absorbs every regenerated frame.
 *
 * @returns {WorkerEngine}
 */
export const makePeerJournalReplayEngine = () =>
  harden({
    canSnapshot: false,
    /** @type {WorkerEngine['start']} */
    start: async ({ debugName, snapshot, onOutbound }) => {
      snapshot === null ||
        snapshot === undefined ||
        Fail`peer journal replay engine cannot restore engine snapshot for worker ${q(
          debugName,
        )}`;
      const incarnation = makePeerIncarnation({ debugName, onOutbound });
      /** @type {WorkerIncarnation} */
      const workerIncarnation = {
        deliver: incarnation.deliverOne,
        snapshot: async () => null,
        terminate: async () => incarnation.kill(),
      };
      return harden(workerIncarnation);
    },
  });
harden(makePeerJournalReplayEngine);

/**
 * The snapshotting mirror of `makeSnapshottingReplayEngine`: the
 * "snapshot" is the engine's own log of delivered envelopes, restored
 * by suppressed replay — indistinguishable, to the transport, from an
 * XS heap restore (no pre-snapshot outbound reappears). Exercises the
 * journal cut and watermark reset without an XS build.
 *
 * @returns {WorkerEngine}
 */
export const makePeerSnapshottingReplayEngine = () =>
  harden({
    canSnapshot: true,
    /** @type {WorkerEngine['start']} */
    start: async ({ debugName, snapshot, onOutbound }) => {
      const incarnation = makePeerIncarnation({ debugName, onOutbound });
      /** @type {Array<Record<string, unknown>>} */
      const log = [];
      if (snapshot !== null && snapshot !== undefined) {
        Array.isArray(snapshot) ||
          Fail`unrecognized snapshot ref for worker ${q(debugName)}`;
        const envelopes = /** @type {Array<Record<string, unknown>>} */ (
          snapshot
        );
        incarnation.setSuppressed(true);
        for (const envelope of envelopes) {
          // eslint-disable-next-line no-await-in-loop
          await incarnation.deliverOne(envelope);
        }
        incarnation.setSuppressed(false);
        log.push(...envelopes);
      }
      /** @type {WorkerIncarnation} */
      const workerIncarnation = {
        deliver: async envelope => {
          log.push(/** @type {Record<string, unknown>} */ (envelope));
          await incarnation.deliverOne(
            /** @type {Record<string, any>} */ (envelope),
          );
        },
        snapshot: async () => JSON.parse(JSON.stringify(log)),
        terminate: async () => incarnation.kill(),
      };
      return harden(workerIncarnation);
    },
  });
harden(makePeerSnapshottingReplayEngine);
