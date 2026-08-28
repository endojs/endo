// @ts-check
/* global globalThis */
/**
 * Weak-value map ("FinalizingMap") with FinalizationRegistry support.
 *
 * Adapted from `@endo/captp/src/finalize.js`. We keep a private copy because
 * captp does not expose this helper.
 */
import { isPrimitive } from '@endo/pass-style';
import { Fail } from '@endo/errors';

const { WeakRef, FinalizationRegistry } = globalThis;

/**
 * @template K
 * @template {WeakKey} V
 * @typedef {{
 *   get(key: K): V | undefined,
 *   has(key: K): boolean,
 *   set(key: K, value: V): void,
 *   delete(key: K): boolean,
 *   clearWithoutFinalizing(): void,
 *   getSize(): number,
 * }} FinalizingMap
 */

/**
 * @template K
 * @template {WeakKey} V
 * @param {(key: K) => void} [finalizer]
 * @param {object} [opts]
 * @param {boolean} [opts.weakValues]
 * @returns {FinalizingMap<K, V>}
 */
export const makeFinalizingMap = (finalizer, opts = {}) => {
  const { weakValues = false } = opts;
  if (!weakValues || !WeakRef || !FinalizationRegistry) {
    /** @type {Map<K, V>} */
    const m = new Map();
    return {
      get: m.get.bind(m),
      has: m.has.bind(m),
      set: (k, v) => {
        m.set(k, v);
      },
      delete: m.delete.bind(m),
      clearWithoutFinalizing: m.clear.bind(m),
      getSize: () => m.size,
    };
  }
  /** @type {Map<K, WeakRef<V>>} */
  const refs = new Map();
  const registry = new FinalizationRegistry(key => {
    // eslint-disable-next-line no-use-before-define
    api.delete(/** @type {K} */ (key));
  });
  const api = {
    get(key) {
      const wr = refs.get(key);
      return wr ? wr.deref() : undefined;
    },
    has(key) {
      return api.get(key) !== undefined;
    },
    set(key, value) {
      !isPrimitive(value) || Fail`weak-value map requires object value`;
      api.delete(key);
      const wr = new WeakRef(value);
      refs.set(key, wr);
      registry.register(value, key, wr);
    },
    delete(key) {
      const wr = refs.get(key);
      if (!wr) return false;
      registry.unregister(wr);
      refs.delete(key);
      if (finalizer) finalizer(key);
      return true;
    },
    clearWithoutFinalizing() {
      for (const wr of refs.values()) registry.unregister(wr);
      refs.clear();
    },
    getSize: () => refs.size,
  };
  return api;
};
