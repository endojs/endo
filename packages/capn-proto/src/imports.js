// @ts-check
/**
 * Import-side bookkeeping for a single connection.
 *
 * Each remote capability is represented by a `Presence` (a HandledPromise
 * with our pipelining handler attached). The `importIdToPresence` weak-value
 * map ensures reference equality across re-imports of the same id.
 */

import { Fail } from '@endo/errors';
import { HandledPromise } from '@endo/eventual-send';

/**
 * @param {object} ctx
 * @param {import('./finalize.js').FinalizingMap<number, object>} ctx.importIdToPresence
 * @param {Map<number, any>} ctx.importEntries
 * @param {(id: number, isPromise: boolean) => any} ctx.makeRemoteHandler
 *   Factory producing a HandledPromise handler for an import id.
 */
export const makeImportRegistry = ({
  importIdToPresence,
  importEntries,
  makeRemoteHandler,
}) => {
  /** Reverse lookup so we can encode pass-back as receiverHosted. */
  /** @type {WeakMap<object, number>} */
  const presenceToImportId = new WeakMap();

  const importCap = (id, isPromise) => {
    const existing = importIdToPresence.get(id);
    if (existing) return existing;

    const handler = makeRemoteHandler(id, isPromise);

    let resolveSettler;
    let rejectSettler;
    let presence;
    if (isPromise) {
      const p = new HandledPromise((res, rej) => {
        resolveSettler = res;
        rejectSettler = rej;
      }, handler);
      p.catch(() => {});
      presence = p;
    } else {
      // resolveWithPresence(handler) returns the underlying Presence object
      // and resolves the promise to it. We keep the Presence (not the
      // promise) as our identity-bearing value.
      let captured;
      const p = new HandledPromise((_resolve, _reject, resolveWithPresence) => {
        captured = resolveWithPresence(handler);
      });
      void p;
      presence = captured;
    }

    importIdToPresence.set(id, /** @type {object} */ (presence));
    importEntries.set(id, {
      presence,
      resolveSettler,
      rejectSettler,
      isPromise,
      resolvedTo: undefined,
    });
    presenceToImportId.set(/** @type {object} */ (presence), id);
    return presence;
  };

  const requireImport = id => {
    const p = importIdToPresence.get(id);
    if (!p) throw Fail`unknown import ${id}`;
    return p;
  };

  return {
    importCap,
    requireImport,
    getImportEntry: id => importEntries.get(id),
    deleteImport: id => {
      importEntries.delete(id);
      importIdToPresence.delete(id);
    },
    /** Returns the import id if `value` is one of our imported presences. */
    importIdOf: value => presenceToImportId.get(/** @type {object} */ (value)),
  };
};
