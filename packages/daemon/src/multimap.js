// @ts-check

/** @import { Multimap, WeakMultimap, BidirectionalMultimap } from './types.js' */

import { q } from '@endo/errors';

/**
 * @param {new () => (Map | WeakMap)} mapConstructor
 * @returns {Multimap<any, any>}
 */
const internalMakeMultimap = mapConstructor => {
  // eslint-disable-next-line new-cap
  const map = new mapConstructor();
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

    getAllFor: key => Array.from(map.get(key) ?? []),

    has: key => map.has(key),
  };
};

/**
 * @returns {Multimap<any, any>}
 */
export const makeMultimap = () => {
  return internalMakeMultimap(Map);
};

/**
 * @returns {WeakMultimap<WeakKey, any>}
 */
export const makeWeakMultimap = () => {
  return internalMakeMultimap(WeakMap);
};

/**
 * @returns {BidirectionalMultimap<any, any>}
 */
export const makeBidirectionalMultimap = () => {
  /**
   * @type {Multimap<unknown, unknown>}
   */
  const keyForValues = internalMakeMultimap(Map);
  const valueForKey = new Map();

  return {
    add: (key, value) => {
      const hasExistingMapping = valueForKey.has(value);
      const existingKey = valueForKey.get(value);

      if (hasExistingMapping && existingKey !== key) {
        throw Error(
          `May not remap key ${q(existingKey)} of existing value to new key ${q(
            key,
          )}. Delete the original mapping first.`,
        );
      }

      keyForValues.add(key, value);
      valueForKey.set(value, key);
    },

    delete: (key, value) => {
      valueForKey.delete(value);
      return keyForValues.delete(key, value);
    },

    deleteAll: key => {
      for (const value of keyForValues.getAllFor(key)) {
        valueForKey.delete(value);
      }
      return keyForValues.deleteAll(key);
    },

    has: key => keyForValues.has(key),

    hasValue: value => valueForKey.has(value),

    get: key => keyForValues.get(key),

    getKey: value => valueForKey.get(value),

    getAll: () => [...valueForKey.keys()],

    getAllFor: key => keyForValues.getAllFor(key),
  };
};
