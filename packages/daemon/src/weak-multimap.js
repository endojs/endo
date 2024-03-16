/**
 * @returns {import('./types.js').WeakMultimap<WeakKey, any>}
 */
export const makeWeakMultimap = () => {
  /** @type {WeakMap<WeakKey, Set<unknown>>} */
  const map = new WeakMap();
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
