/**
 * @returns {import('./types.js').WeakMultimap<WeakKey, any>}
 */
export const makeWeakMultimap = () => {
  /** @type {WeakMap<WeakKey, Set<unknown>>} */
  const map = new WeakMap();
  return {
    add: (ref, formulaIdentifier) => {
      let set = map.get(ref);
      if (set === undefined) {
        set = new Set();
        map.set(ref, set);
      }
      set.add(formulaIdentifier);
    },

    delete: (ref, formulaIdentifier) => {
      const set = map.get(ref);
      if (set !== undefined) {
        const result = set.delete(formulaIdentifier);
        if (set.size === 0) {
          map.delete(ref);
        }
        return result;
      }
      return false;
    },

    deleteAll: ref => map.delete(ref),

    get: ref => map.get(ref)?.keys().next().value,

    getAll: ref => Array.from(map.get(ref) ?? []),
  };
};
