import { E } from '@endo/far';

/**
 * @import { Json } from '@metamask/eth-query'
 */

const initialValue = () => ({});

/**
 * @param {string} name
 * @param {any} powers
 */
export const make = async (name, powers) => {
  /** @returns {Promise<Record<string, Json>>} */
  const getState = async () => await E(powers).lookup(name);

  /** @param {Record<string, Json>} state */
  const setState = async (state) => await E(powers).storeValue(state, name);

  if (!(await E(powers).has(name))) {
    await setState(initialValue());
  }

  return {
    getState,
    async clear() {
      await setState(initialValue());
    },
    /**
     * @param {string} key
     * @returns {Promise<Json | undefined>}
     */
    async get(key) {
      const state = await getState();
      return state[key];
    },
    /**
     * @param {string} key
     * @param {Json} value
     */
    async set(key, value) {
      const state = await getState();
      await setState({ ...state, [key]: value });
    },
  };
};
