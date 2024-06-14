import { makeExo } from '@endo/exo';
import { E } from '@endo/far';

import { getExoInterface, names } from '../utils.js';

/** @param {any} powers */
export const make = async (powers) => {
  if (!(await E(powers).has(names.BUNDLER))) {
    await E(powers).request('SELF', 'Please provide a bundler.', 'bundler');
  }

  const bundlerPowers = makeExo(
    'BundlerPowers',
    getExoInterface('BundlerPowers'),
    {
      /** @param {unknown[]} args */
      makeBundle(...args) {
        return E(powers).makeBundle(...args);
      },
      /** @param {unknown[]} args */
      makeUnconfined(...args) {
        return E(powers).makeUnconfined(...args);
      },
      /** @param {unknown[]} args */
      storeBlob(...args) {
        return E(powers).storeBlob(...args);
      },
    },
  );
  const bundler = await E(powers).lookup(names.BUNDLER);

  if (!(await E(powers).has(names.KEYRING))) {
    await E(bundler).makeUnconfined(
      'src/caplets/keyring.js',
      names.KEYRING,
      bundlerPowers,
    );
  }
  const keyring = await E(powers).lookup(names.KEYRING);

  return makeExo('Wallet', getExoInterface('Wallet'), {
    /**
     * @param {string} seedPhrase
     */
    async init(seedPhrase) {
      await E(keyring).init(seedPhrase);
    },

    async getAddresses() {
      return [await E(keyring).getAddress()];
    },
  });
};
