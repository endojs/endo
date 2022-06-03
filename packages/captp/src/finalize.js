/* global globalThis */
import { Far } from '@endo/marshal';

// @ts-check
const { WeakRef, FinalizationRegistry } = globalThis;

/**
 * @template K
 * @template V
 *
 * @param {(key: K) => void} [finalizer]
 * @returns {Pick<Map<K, V>, 'get' | 'has' | 'set' | 'delete'> &
 *  {
 *   clear: () => void,
 *   getSize: () => number,
 * }}
 */
export const makeFinalizingMap = finalizer => {
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
    // eslint-disable-next-line no-use-before-define
    finalizingMap.delete(key);
  });
  const finalizingMap = Far('finalizingMap', {
    clear: () => {
      for (const ref of keyToRef.values()) {
        registry.unregister(ref);
      }
      keyToRef.clear();
    },
    get: key => keyToRef.get(key)?.deref(),
    has: key => keyToRef.has(key),
    set: (key, ref) => {
      const objref = Object(ref);
      assert.equal(Object(ref), ref);
      const wr = new WeakRef(objref);
      keyToRef.set(key, wr);
      registry.register(objref, key, wr);
    },
    delete: key => {
      if (!keyToRef.has(key)) {
        return;
      }

      registry.unregister(keyToRef.get(key));
      keyToRef.delete(key);
      if (finalizer) {
        finalizer(key);
      }
    },
    getSize: () => keyToRef.size,
    entries: () =>
      [...keyToRef.entries()].map(([key, ref]) => [key, ref.deref()]),
  });
  return finalizingMap;
};
