/* global globalThis */
import { Far, isObject } from '@endo/marshal';

// @ts-check
const { WeakRef, FinalizationRegistry } = globalThis;

/**
 *
 * Elsewhere this is known as a "Weak Value Map". Whereas a std JS WeakMap
 * is weak on its keys, this map is weak on its values. It does not retain these
 * values strongly. If a given value disappears, then the entries for it
 * disappear from every weak-value-map that holds it as a value.
 *
 * Just as a WeakMap only allows gc-able values as keys, a weak-value-map
 * only allows gc-able values as values.
 *
 * Unlike a WeakMap, a weak-value-map
 * unavoidably exposes the non-determinism of gc to its clients. Thus, both
 * the ability to create one, as well as each created one, must be treated
 * as dangerous capabilities that must be closely held. A program with access
 * to these can read side channels though gc that do *not* rely on the ability
 * to measure duration. This is a separate, and bad, timing-independent
 * side channel.
 *
 * This non-determinism also enable code to escape deterministic replay. In a
 * blockchain context, this could cause validators to differ from each other,
 * preventing consensus, and thus preventing chain progress.
 *
 * JS std weakrefs have been carefully designed so that operations which
 * `deref()` a weakref cause that weakref to remain stable for the remainder of
 * that turn. The operations below guaranteed to do this derefing are
 * `has`, `get`, `set`, `delete`. Note that neither `clear` nor `getSize` are
 * guaranteed to deref. Thus, a call to `map.getSize()` may reflect values
 * that might still be collected later in the same turn.
 *
 * @template K
 * @template V
 *
 * @returns {Pick<Map<K, V>, 'get' | 'has' | 'set' | 'delete' | 'clear'> &
 *  {
 *   getSize: () => number,
 * }}
 */
export const makeFinalizingMap = () => {
  const keyToRef = new Map();
  if (!WeakRef || !FinalizationRegistry) {
    return Far('fakeFinalizingMap', {
      clear: keyToRef.clear,
      get: keyToRef.get,
      has: keyToRef.has,
      set: keyToRef.set,
      delete: keyToRef.delete,
      getSize: () => keyToRef.size,
    });
  }
  const registry = new FinalizationRegistry(key => {
    // Because this will delete the current binding of `key`, we need to
    // be sure that it is not called because a previous binding was collected.
    // We do this with the `unregister` in `set` below, assuming that
    // `unregister` *immediately* suppresses the finalization of the thing
    // it unregisters. TODO If this is not actually guaranteed, i.e., if
    // finalizations that have, say, already been scheduled might still
    // happen after they've been unregistered, we will need to revisit this.
    // eslint-disable-next-line no-use-before-define
    finalizingMap.delete(key);
  });
  const finalizingMap = Far('finalizingMap', {
    // `clear` does not `deref` anything, and so does not suppress collection
    // of the weakly-pointed-to values until the end of the turn.
    // Because `clear` immediately removes all entries from this map, this
    // possible collection is not observable using only this map instance.
    // But it is observable via other uses of WeakRef or FinalizationGroup,
    // including other map instances made by this `makeFinalizingMap`.
    //
    clear: () => {
      for (const ref of keyToRef.values()) {
        registry.unregister(ref);
      }
      keyToRef.clear();
    },
    // Does deref, and thus does guarantee stability of the value until the
    // end of the turn.
    get: key => keyToRef.get(key)?.deref(),
    // Does deref, and thus does guarantee stability of the value until the
    // end of the turn.
    has: key => keyToRef.get(key)?.deref() !== undefined,
    // Does deref, and thus does guarantee stability of both old and new values
    // until the end of the turn.
    set: (key, ref) => {
      assert(isObject(ref));
      const oldWR = keyToRef.get(key);
      if (oldWR !== undefined && oldWR.deref() !== undefined) {
        // Assumed to immediately suppress finalization associated with
        // registration of `oldWR`.
        registry.unregister(oldWR);
      }
      const newWR = new WeakRef(ref);
      keyToRef.set(key, newWR);
      registry.register(ref, key, newWR);
    },
    delete: key => {
      if (!keyToRef.has(key)) {
        return;
      }

      registry.unregister(keyToRef.get(key));
      keyToRef.delete(key);
      // We should only call finalize here if we also call it for `clear`
      // and for `oldWR` within `set`, and within our own finalizer.
      // Either that, or we need to explain why it is
      //    a) coherent to call it just from `delete`
      //    b) why it isn't just as easy for the clients to just do their
      //       finalization action for themselves at the same place where
      //       they would call `delete`.
    },
    getSize: () => keyToRef.size,
    // `entries` is omitted both from the type and from the `fakeFinalizingMap`,
    // and so should be omitted here as well. If it is present, since it needs
    // to deref anyway, it should filter out those that were already collected.
    // Thus, `entries` would also be a dereffing operation, which thereby
    // guaranteed stability for all the values it returns.
  });
  return finalizingMap;
};
