// @ts-check
/* global setTimeout */
import harden from '@endo/harden';
import { Fail, q } from '@endo/errors';

import { makeWorkerShell } from './worker-shell.js';

/**
 * @import {WorkerEngine, WorkerIncarnation} from './host.js'
 */

/**
 * A {@link WorkerEngine} that emulates orthogonal persistence without an
 * engine-level heap snapshot: every incarnation starts from a fresh
 * worker shell, and the host reconstructs worker state by replaying the
 * journal of every message it ever delivered. For a deterministic guest,
 * replay-at-quiescence is behaviorally indistinguishable from restoring a
 * heap snapshot.
 *
 * This is the test and reference engine. A production engine backs
 * incarnations with XS machines under a snapshotting supervisor (see the
 * design document), where `snapshot` returns a content-addressed snapshot
 * ref and the journal is truncated at each snapshot point.
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
      let alive = true;
      const shell = makeShell({
        send: message => {
          if (alive) {
            onOutbound(message);
          }
        },
        name: `siesta-worker:${workerName}`,
      });

      /** @type {WorkerIncarnation} */
      const incarnation = {
        deliver: async message => {
          alive ||
            Fail`worker ${q(workerName)} incarnation has been terminated`;
          shell.dispatch(message);
          // Let the delivery's promise chain settle so any replies are
          // emitted (or suppressed by the host's replay window) before
          // the next delivery.
          await new Promise(resolve => setTimeout(resolve, 0));
        },
        snapshot: async () => null,
        terminate: async () => {
          alive = false;
        },
      };
      return harden(incarnation);
    },
  });
harden(makeJournalReplayEngine);
