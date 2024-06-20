import { E } from '@endo/far';

/**
 * @import { Json } from '@metamask/eth-query'
 */

/**
 * @param {string} name
 * @param {any} powers
 */
export const make = async (name, powers) => {
  if (!(await E(powers).has(name))) {
    await E(powers).storeValue([], name);
  }

  const get = async () => await E(powers).lookup(name);

  return {
    get,
    async clear() {
      await E(powers).storeValue([], name);
    },
    /**
     * @param {Json} element
     */
    async push(element) {
      const existingValue = await get();
      await E(powers).storeValue([...existingValue, element], name);
    },
  };
};
