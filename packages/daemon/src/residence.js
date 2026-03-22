// @ts-check

import { makeDefaultCapTPImportExportTables } from '@endo/captp';
import { q } from '@endo/errors';

/** @import { FormulaIdentifier, Formula } from './types.js' */

/**
 * @typedef {object} ResidenceEvent
 * @property {string} retainerId
 * @property {FormulaIdentifier} retaineeId
 * @property {string} retaineeIncarnation - Unique per-export token (e.g., CapTP slot).
 */

/**
 * @typedef {object} ResidenceWatcher
 * @property {(event: ResidenceEvent) => void} retain
 * @property {(event: ResidenceEvent) => void} release
 * @property {(retainerId: string) => void} releaseAllForRetainer
 */

/**
 * Tracks which CapTP connections retain references to which formulas.
 * Used by formula collection to disconnect connections and terminate
 * workers that hold references to collected formulas.
 *
 * @param {object} args
 * @param {(ref: unknown) => FormulaIdentifier | undefined} args.getLocalIdForRef
 * @param {(id: FormulaIdentifier) => Formula | undefined} args.getFormula
 * @param {(workerId: string, reason: Error) => void} args.terminateWorker
 */
export const makeResidenceTracker = ({
  getLocalIdForRef,
  getFormula,
  terminateWorker,
}) => {
  let nextRetainerId = 0;
  /** @type {Map<string, Map<FormulaIdentifier, Set<string>>>} */
  const retaineesByRetainer = new Map();
  /** @type {Map<string, (reason?: Error) => Promise<void>>} */
  const retainerClose = new Map();
  /** @type {Map<string, string>} */
  const workerForRetainer = new Map();
  /** @type {WeakMap<object, string>} */
  const originRetainerForRef = new WeakMap();

  /** @type {ResidenceWatcher} */
  const residenceWatcher = harden({
    retain: ({ retainerId, retaineeId, retaineeIncarnation }) => {
      const retainees = retaineesByRetainer.get(retainerId);
      if (!retainees) {
        return;
      }
      let incarnations = retainees.get(retaineeId);
      if (!incarnations) {
        incarnations = new Set();
        retainees.set(retaineeId, incarnations);
      }
      incarnations.add(retaineeIncarnation);
    },
    release: ({ retainerId, retaineeId, retaineeIncarnation }) => {
      const retainees = retaineesByRetainer.get(retainerId);
      if (!retainees) {
        return;
      }
      const incarnations = retainees.get(retaineeId);
      if (!incarnations) {
        return;
      }
      incarnations.delete(retaineeIncarnation);
      if (incarnations.size === 0) {
        retainees.delete(retaineeId);
      }
    },
    releaseAllForRetainer: retainerId => {
      retaineesByRetainer.delete(retainerId);
    },
  });

  const register = ({ name, close, closed }) => {
    const retainerId = `${name}-${nextRetainerId}`;
    nextRetainerId += 1;
    retaineesByRetainer.set(retainerId, new Map());
    retainerClose.set(retainerId, close);
    if (name.startsWith('Worker ')) {
      workerForRetainer.set(retainerId, name.slice('Worker '.length));
    }

    closed.then(() => {
      residenceWatcher.releaseAllForRetainer(retainerId);
      retainerClose.delete(retainerId);
      workerForRetainer.delete(retainerId);
    });

    const capTpOptions = {
      exportHook: (val, slot) => {
        const id = getLocalIdForRef(val);
        if (id !== undefined) {
          residenceWatcher.retain({
            retainerId,
            retaineeId: id,
            retaineeIncarnation: slot,
          });
        }
      },
      importHook: (val, _slot) => {
        if (
          (typeof val === 'object' && val !== null) ||
          typeof val === 'function'
        ) {
          originRetainerForRef.set(/** @type {object} */ (val), retainerId);
        }
      },
      makeCapTPImportExportTables: options => {
        const tables = makeDefaultCapTPImportExportTables(options);
        const { deleteExport } = tables;
        tables.deleteExport = slot => {
          const exported = tables.getExport(slot);
          const id = getLocalIdForRef(exported);
          if (id !== undefined) {
            residenceWatcher.release({
              retainerId,
              retaineeId: id,
              retaineeIncarnation: slot,
            });
          }
          deleteExport(slot);
        };
        return tables;
      },
    };

    return capTpOptions;
  };

  /**
   * Disconnects CapTP connections and terminates workers that hold
   * references to any of the given collected formula ids.
   *
   * @param {Iterable<FormulaIdentifier>} ids
   */
  const disconnectRetainersHolding = ids => {
    const collected = new Set(ids);
    for (const [retainerId, retainees] of retaineesByRetainer.entries()) {
      for (const id of retainees.keys()) {
        if (collected.has(id)) {
          const workerId = workerForRetainer.get(retainerId);
          if (!workerId) {
            break;
          }
          const formula = getFormula(id);
          if (!formula || formula.type === 'invitation') {
            break;
          }
          const reason = new Error(
            `Formula ${q(formula.type)} became unreachable by any pet name path and was collected`,
          );
          const close = retainerClose.get(retainerId);
          if (close) {
            close(reason).catch(() => {});
          }
          terminateWorker(workerId, reason);
          break;
        }
      }
    }
  };

  return harden({
    register,
    disconnectRetainersHolding,
    residenceWatcher,
  });
};
