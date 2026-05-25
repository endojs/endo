/* global globalThis */
import harden from '@endo/harden';

const { WeakRef, FinalizationRegistry } = globalThis;

/**
 * @template K
 * @template {object} V
 * @typedef {{
 *   get: (key: K) => V | undefined,
 *   has: (key: K) => boolean,
 *   set: (key: K, value: V) => void,
 *   delete: (key: K) => boolean,
 *   getSize: () => number,
 *   clearWithoutFinalizing: () => void,
 * }} FinalizingMap
 */

/**
 * A weak-value map: weak on values, strong on keys.  When a value is GC'd,
 * the entry disappears and the optional finalizer is invoked with the key.
 *
 * If WeakRef / FinalizationRegistry are unavailable or weakValues is false,
 * falls back to a strong Map (no GC notifications).
 *
 * @template K
 * @template {object} V
 * @param {(key: K) => void} [finalizer]
 * @param {{ weakValues?: boolean }} [opts]
 * @returns {FinalizingMap<K, V>}
 */
export const makeFinalizingMap = (finalizer, opts) => {
  const { weakValues = false } = opts || {};
  if (!weakValues || !WeakRef || !FinalizationRegistry) {
    /** @type {Map<K, V>} */
    const keyToVal = new Map();
    return harden({
      get: key => keyToVal.get(key),
      has: key => keyToVal.has(key),
      set: (key, val) => {
        keyToVal.set(key, val);
      },
      delete: key => keyToVal.delete(key),
      getSize: () => keyToVal.size,
      clearWithoutFinalizing: () => keyToVal.clear(),
    });
  }
  /** @type {Map<K, WeakRef<any>>} */
  const keyToRef = new Map();
  /** @type {FinalizationRegistry<K>} */
  const registry = new FinalizationRegistry(key => {
    // eslint-disable-next-line no-use-before-define
    finalizingMap.delete(key);
  });
  const finalizingMap = harden({
    clearWithoutFinalizing: () => {
      for (const ref of keyToRef.values()) {
        registry.unregister(ref);
      }
      keyToRef.clear();
    },
    get: key => {
      const wr = keyToRef.get(key);
      if (!wr) return undefined;
      return wr.deref();
    },
    has: key => finalizingMap.get(key) !== undefined,
    set: (key, val) => {
      finalizingMap.delete(key);
      const wr = new WeakRef(val);
      keyToRef.set(key, wr);
      registry.register(val, key, wr);
    },
    delete: key => {
      const wr = keyToRef.get(key);
      if (!wr) return false;
      registry.unregister(wr);
      keyToRef.delete(key);
      if (finalizer) {
        finalizer(key);
      }
      return true;
    },
    getSize: () => keyToRef.size,
  });
  return finalizingMap;
};
