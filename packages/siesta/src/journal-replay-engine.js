// @ts-check
/* global setTimeout */
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';

import { makeWorkerShell } from './worker-shell.js';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './host.js'
 */

const macrotask = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * One in-process worker shell with delivery and suppression controls,
 * shared by the reference engines.
 *
 * @param {object} options
 * @param {typeof makeWorkerShell} options.makeShell
 * @param {string} options.workerName
 * @param {(message: Record<string, unknown>) => void} options.onOutbound
 */
const makeShellIncarnation = ({ makeShell, workerName, onOutbound }) => {
  let alive = true;
  let suppressed = false;
  const shell = makeShell({
    send: message => {
      if (alive && !suppressed) {
        onOutbound(message);
      }
    },
    name: `siesta-worker:${workerName}`,
  });
  return harden({
    /** @param {boolean} value */
    setSuppressed: value => {
      suppressed = value;
    },
    /** @param {Record<string, unknown>} message */
    dispatchOne: async message => {
      alive || Fail`worker ${q(workerName)} incarnation has been terminated`;
      shell.dispatch(message);
      // Let the delivery's promise chain settle so any replies are
      // emitted (or suppressed) before the next delivery.
      await macrotask();
    },
    kill: () => {
      alive = false;
    },
  });
};

/**
 * A {@link WorkerEngine} that emulates orthogonal persistence without an
 * engine-level heap snapshot: every incarnation starts from a fresh
 * worker shell, and the host reconstructs worker state by replaying the
 * journal of every message it ever delivered. For a deterministic guest,
 * replay-at-quiescence is behaviorally indistinguishable from restoring a
 * heap snapshot.
 *
 * Because `canSnapshot` is false the host retains the full journal
 * forever; use {@link makeSnapshottingReplayEngine} (or a real
 * snapshotting engine) when journal growth matters.
 *
 * @param {object} [options]
 * @param {typeof makeWorkerShell} [options.makeShell]
 * @returns {WorkerEngine}
 */
export const makeJournalReplayEngine = ({ makeShell = makeWorkerShell } = {}) =>
  harden({
    canSnapshot: false,
    /** @type {WorkerEngine['start']} */
    start: async ({ workerName, snapshot, onOutbound }) => {
      snapshot === null ||
        snapshot === undefined ||
        Fail`journal replay engine cannot restore engine snapshot for worker ${q(
          workerName,
        )}`;
      const incarnation = makeShellIncarnation({
        makeShell,
        workerName,
        onOutbound,
      });
      /** @type {WorkerIncarnation} */
      const workerIncarnation = {
        deliver: incarnation.dispatchOne,
        snapshot: async () => null,
        terminate: async () => incarnation.kill(),
      };
      return harden(workerIncarnation);
    },
  });
harden(makeJournalReplayEngine);

/**
 * A {@link WorkerEngine} with `canSnapshot: true`, exercising the host's
 * full snapshot lifecycle — journal truncation at sleep, restore from
 * snapshot ref plus journal suffix — without an XS build.
 *
 * The snapshot ref is the engine's own log of every message delivered to
 * the incarnation: an honest implementation of the snapshot contract (an
 * opaque durable value that fully reconstructs guest state), standing in
 * for XS heap bytes. Restoration replays the logged messages into a
 * fresh shell with outbound suppression. A production engine returns a
 * content-addressed heap snapshot instead; the host cannot tell the
 * difference.
 *
 * @param {object} [options]
 * @param {typeof makeWorkerShell} [options.makeShell]
 * @returns {WorkerEngine}
 */
export const makeSnapshottingReplayEngine = ({
  makeShell = makeWorkerShell,
} = {}) =>
  harden({
    canSnapshot: true,
    /** @type {WorkerEngine['start']} */
    start: async ({ workerName, snapshot, onOutbound }) => {
      const incarnation = makeShellIncarnation({
        makeShell,
        workerName,
        onOutbound,
      });
      /** @type {Array<Record<string, unknown>>} */
      const log = [];
      if (snapshot !== null && snapshot !== undefined) {
        Array.isArray(snapshot) ||
          Fail`unrecognized snapshot ref for worker ${q(workerName)}`;
        const messages = /** @type {Array<Record<string, unknown>>} */ (
          snapshot
        );
        incarnation.setSuppressed(true);
        for (const message of messages) {
          // eslint-disable-next-line no-await-in-loop
          await incarnation.dispatchOne(message);
        }
        incarnation.setSuppressed(false);
        log.push(...messages);
      }
      /** @type {WorkerIncarnation} */
      const workerIncarnation = {
        deliver: async message => {
          log.push(message);
          await incarnation.dispatchOne(message);
        },
        snapshot: async () => JSON.parse(JSON.stringify(log)),
        terminate: async () => incarnation.kill(),
      };
      return harden(workerIncarnation);
    },
  });
harden(makeSnapshottingReplayEngine);
