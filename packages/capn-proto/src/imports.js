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
import { Remotable } from '@endo/pass-style';

/**
 * @param {object} ctx
 * @param {import('./finalize.js').FinalizingMap<number, object>} ctx.importIdToPresence
 * @param {Map<number, any>} ctx.importEntries
 * @param {(id: number, isPromise: boolean) => any} ctx.makeRemoteHandler
 *   Factory producing a HandledPromise handler for an import id.
 * @param {(presence: object, importId: number) => void} [ctx.onImport]
 *   Optional notifier invoked exactly once per freshly-created Presence,
 *   used by the network's CapHomeRegistry to record where this Presence
 *   came from so the auto-Provide path can find its home connection.
 */
export const makeImportRegistry = ({
  importIdToPresence,
  importEntries,
  makeRemoteHandler,
  onImport,
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
      // promise) as our identity-bearing value, then upgrade it via
      // `Remotable(...)` so `@endo/pass-style` accepts it as a properly
      // declared remotable when it crosses an Exo / marshal boundary.
      let captured;
      // eslint-disable-next-line no-new
      new HandledPromise((_resolve, _reject, resolveWithPresence) => {
        captured = resolveWithPresence(handler);
      });
      // Remotable mutates `captured`'s prototype to a tag record and
      // hardens it. The HandledPromise-side maps (presenceToHandler etc.)
      // are keyed by reference, so the in-place upgrade is invisible to
      // them.
      presence = Remotable(
        `Alleged: capn-proto/import:${id}`,
        undefined,
        captured,
      );
    }

    importIdToPresence.set(id, /** @type {object} */ (presence));
    importEntries.set(id, {
      // NOTE: deliberately no strong `presence` reference here; importEntries
      // is a strong Map and including the presence would defeat the
      // FinalizationRegistry on importIdToPresence (the whole point of the
      // weak map is so the user-facing Presence can be GC'd when the user
      // drops it, triggering the Release-on-finalize callback).
      resolveSettler,
      rejectSettler,
      isPromise,
      resolvedTo: undefined,
    });
    presenceToImportId.set(/** @type {object} */ (presence), id);
    if (onImport) onImport(/** @type {object} */ (presence), id);
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
    /**
     * Returns the import id if `value` is one of our imported presences.
     *
     * @param {unknown} value
     */
    importIdOf: value => presenceToImportId.get(/** @type {object} */ (value)),
  };
};
