import { E } from '@endo/far';

import { makeExo, names } from '../utils.js';
import { make as makeStore } from './subcomponents/array-store.js';

/**
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/** @param {any} powers */
export const make = async (powers) => {
  const { keyring, provider } = await bootstrap();

  let isInitialized = false;
  const assertIsInitialized = () => {
    if (!isInitialized) {
      throw new Error('Wallet must be initialized first.');
    }
  };

  return makeExo('Wallet', {
    /**
     * @param {string} seedPhrase
     * @param {string} infuraProjectId
     */
    async init(seedPhrase, infuraProjectId) {
      await E(keyring).init(seedPhrase);
      await E(provider).init(infuraProjectId);
      isInitialized = true;
    },

    async getAddresses() {
      assertIsInitialized();
      return [await E(keyring).getAddress()];
    },

    /**
     * Make a JSON-RPC request to the node.
     * @param {string} method
     * @param {JsonRpcParams} [params]
     */
    async request(method, params) {
      assertIsInitialized();
      if (method === 'eth_sendTransaction') {
        throw new Error('not implemented');
      }
      return await E(provider).request(method, params);
    },
  });

  async function bootstrap() {
    // This resolves the value named "bundler" if it already exists.
    await E(powers).request('SELF', 'Please provide a bundler.', 'bundler');
    const bundler = await E(powers).lookup(names.BUNDLER);

    const bundlerPowers = makeExo('BundlerPowers', {
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
    });

    if (!(await E(powers).has(names.KEYRING))) {
      await E(bundler).makeUnconfined(
        'src/caplets/keyring.js',
        names.KEYRING,
        bundlerPowers,
      );
    }

    if (!(await E(powers).has(names.PROVIDER))) {
      await E(bundler).makeUnconfined(
        'src/caplets/provider.js',
        names.PROVIDER,
        bundlerPowers,
      );
    }

    return {
      keyring: await E(powers).lookup(names.KEYRING),
      provider: await E(powers).lookup(names.PROVIDER),
      transactions: await makeStore(names.TRANSACTIONS, powers),
    };
  }
};
