// @ts-check
/**
 * Export-side bookkeeping for a single connection.
 *
 * The `valToExportId` and `promiseValToExportId` WeakMaps preserve identity:
 * a given local capability is exported under exactly one id while the peer
 * holds at least one reference. The peer's `Release { id, referenceCount }`
 * decrements the count; the entry is dropped when it reaches zero, freeing
 * the id for reuse and letting a subsequent re-export of the same value get
 * a new id.
 */

import { Fail } from '@endo/errors';

/**
 * @param {object} ctx
 * @param {Map<number, any>} ctx.exports
 * @param {WeakMap<object, number>} ctx.valToExportId
 * @param {WeakMap<Promise<unknown>, number>} ctx.promiseValToExportId
 * @param {{ alloc(): number, release(id: number): void }} ctx.exportIds
 * @param {(value: unknown) => boolean} ctx.isPromise
 */
export const makeExportRegistry = ({
  exports: expTable,
  valToExportId,
  promiseValToExportId,
  exportIds,
  isPromise,
}) => {
  /**
   * Get-or-allocate an export id for a local value. Increments refCount.
   *
   * @param {unknown} value
   * @returns {{ id: number, isPromise: boolean }}
   */
  const exportValue = value => {
    if (value === null || value === undefined) {
      throw Fail`cannot export null/undefined`;
    }
    const promise = isPromise(value);
    const map = promise ? promiseValToExportId : valToExportId;
    const existing = map.get(/** @type {object} */ (value));
    if (existing !== undefined) {
      const entry = expTable.get(existing);
      if (entry) {
        entry.refCount += 1;
        return { id: existing, isPromise: entry.isPromise };
      }
    }
    const id = exportIds.alloc();
    expTable.set(id, {
      value,
      isPromise: promise,
      refCount: 1,
      resolved: !promise,
      vine: undefined,
    });
    map.set(/** @type {object} */ (value), id);
    return { id, isPromise: promise };
  };

  /**
   * Apply a Release from the peer.
   *
   * @param {number} id
   * @param {number} dec
   */
  const releaseExport = (id, dec) => {
    const entry = expTable.get(id);
    if (!entry) return;
    entry.refCount -= dec;
    if (entry.refCount <= 0) {
      // Drop the WeakMap entry so a fresh export gets a new id.
      const map = entry.isPromise ? promiseValToExportId : valToExportId;
      // WeakMap.delete is allowed for any key.
      map.delete(/** @type {object} */ (entry.value));
      expTable.delete(id);
      exportIds.release(id);
    }
  };

  return { exportValue, releaseExport };
};
