// @ts-check

/**
 * @param {Map | WeakMap} internalMap
 * @returns {import('./types.js').Multimap<any, any>}
 */
const internalMakeMultimap = internalMap => {
  const map = internalMap;
  return {
    add: (key, value) => {
      let set = map.get(key);
      if (set === undefined) {
        set = new Set();
        map.set(key, set);
      }
      set.add(value);
    },

    delete: (key, value) => {
      const set = map.get(key);
      if (set !== undefined) {
        const result = set.delete(value);
        if (set.size === 0) {
          map.delete(key);
        }
        return result;
      }
      return false;
    },

    deleteAll: key => map.delete(key),

    get: key => map.get(key)?.keys().next().value,

    getAll: key => Array.from(map.get(key) ?? []),
  };
};

/**
 * @returns {import('./types.js').Multimap<any, any>}
 */
export const makeMultimap = () => {
  return internalMakeMultimap(new Map());
};

/**
 * @returns {import('./types.js').WeakMultimap<WeakKey, any>}
 */
export const makeWeakMultimap = () => {
  return internalMakeMultimap(new WeakMap());
};
