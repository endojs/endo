/* global globalThis */
import { Far, isObject } from '@endo/marshal';

// @ts-check
const { WeakRef, FinalizationRegistry } = globalThis;

/**
 * @template K
 * @template {object} V
 * @typedef {Pick<Map<K, V>, 'get' | 'has' | 'delete'> &
 *  {
 *   set: (key: K, value: V) => void,
 *   clearWithoutFinalizing: () => void,
 *   getSize: () => number,
 * }} FinalizingMap
 */

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
 * Unlike a WeakMap, a weak-value-map unavoidably exposes the non-determinism of
 * gc to its clients. Thus, both the ability to create one, as well as each
 * created one, must be treated as dangerous capabilities that must be closely
 * held. A program with access to these can read side channels though gc that do
 * not* rely on the ability to measure duration. This is a separate, and bad,
 * timing-independent side channel.
 *
 * This non-determinism also enables code to escape deterministic replay. In a
 * blockchain context, this could cause validators to differ from each other,
 * preventing consensus, and thus preventing chain progress.
 *
 * JS standards weakrefs have been carefully designed so that operations which
 * `deref()` a weakref cause that weakref to remain stable for the remainder of
 * that turn. The operations below guaranteed to do this derefing are `has`,
 * `get`, `set`, `delete`. Note that neither `clearWithoutFinalizing` nor
 * `getSize` are guaranteed to deref. Thus, a call to `map.getSize()` may
 * reflect values that might still be collected later in the same turn.
 *
 * @template K
 * @template {object} V
 * @param {(key: K) => void} [finalizer]
 * @param {object} [opts]
 * @param {boolean} [opts.weakValues]
 * @returns {FinalizingMap<K, V> &
 *  import('@endo/eventual-send').RemotableBrand<{}, FinalizingMap<K, V>>
 * }
 */
export const makeFinalizingMap = (finalizer, opts) => {
  const { weakValues = false } = opts || {};
  if (!weakValues || !WeakRef || !FinalizationRegistry) {
    /** @type Map<K, V> */
    const keyToVal = new Map();
    return Far('fakeFinalizingMap', {
      clearWithoutFinalizing: keyToVal.clear.bind(keyToVal),
      get: keyToVal.get.bind(keyToVal),
      has: keyToVal.has.bind(keyToVal),
      set: (key, val) => {
        keyToVal.set(key, val);
      },
      delete: keyToVal.delete.bind(keyToVal),
      getSize: () => keyToVal.size,
    });
  }
  /** @type Map<K, WeakRef<any>> */
  const keyToRef = new Map();
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
    /**
     * `clearWithoutFinalizing` does not `deref` anything, and so does not
     * suppress collection of the weakly-pointed-to values until the end of the
     * turn.  Because `clearWithoutFinalizing` immediately removes all entries
     * from this map, this possible collection is not observable using only this
     * map instance.  But it is observable via other uses of WeakRef or
     * FinalizationGroup, including other map instances made by this
     * `makeFinalizingMap`.
     */
    clearWithoutFinalizing: () => {
      for (const ref of keyToRef.values()) {
        registry.unregister(ref);
      }
      keyToRef.clear();
    },
    // Does deref, and thus does guarantee stability of the value until the
    // end of the turn.
    get: key => keyToRef.get(key)?.deref(),
    has: key => finalizingMap.get(key) !== undefined,
    // Does deref, and thus does guarantee stability of both old and new values
    // until the end of the turn.
    set: (key, ref) => {
      assert(isObject(ref));
      finalizingMap.delete(key);
      const newWR = new WeakRef(ref);
      keyToRef.set(key, newWR);
      registry.register(ref, key, newWR);
    },
    delete: key => {
      const wr = keyToRef.get(key);
      if (!wr) {
        return false;
      }

      registry.unregister(wr);
      keyToRef.delete(key);

      // Our semantics are to finalize upon explicit `delete`, `set` (which
      // calls `delete`) or garbage collection (which also calls `delete`).
      // `clearWithoutFinalizing` is exempt.
      if (finalizer) {
        finalizer(key);
      }
      return true;
    },
    getSize: () => keyToRef.size,
  });
  return finalizingMap;
};
