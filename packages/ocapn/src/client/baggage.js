// @ts-check

import harden from '@endo/harden';

/**
 * @typedef {object} Baggage
 * @property {(key: string) => boolean} has
 * @property {(key: string) => any} get
 * @property {(key: string, value: any) => void} init
 * @property {(key: string, value: any) => void} [set]
 */

/**
 * Creates an in-memory baggage implementation.
 *
 * This intentionally keeps semantics simple:
 * - `init` fails if the key already exists
 * - values are held strongly in process memory
 *
 * @returns {Baggage}
 */
export const makeInMemoryBaggage = () => {
  const entries = new Map();

  /** @type {Baggage} */
  const baggage = {
    has: key => entries.has(key),
    get: key => entries.get(key),
    init: (key, value) => {
      if (entries.has(key)) {
        throw Error(`Baggage key already initialized: ${key}`);
      }
      entries.set(key, value);
    },
    set: (key, value) => {
      entries.set(key, value);
    },
  };

  return harden(baggage);
};

/**
 * @template T
 * @param {Baggage} baggage
 * @param {string} key
 * @param {() => T} makeValue
 * @returns {T}
 */
export const provideFromBaggage = (baggage, key, makeValue) => {
  if (baggage.has(key)) {
    return baggage.get(key);
  }
  const value = makeValue();
  if (typeof baggage.init === 'function') {
    baggage.init(key, value);
  } else if (typeof baggage.set === 'function') {
    baggage.set(key, value);
  } else {
    throw Error('Baggage must support either init or set');
  }
  return value;
};

/**
 * Baggage helper for map-like durable tables.
 *
 * In durable deployments this is where storage can reject unsupported values
 * (for example, non-durable remotables) by throwing from `set`.
 *
 * @template T
 * @param {Baggage} baggage
 * @param {string} key
 * @returns {Map<string, T>}
 */
export const provideMapStoreFromBaggage = (baggage, key) => {
  return provideFromBaggage(baggage, key, () => new Map());
};
