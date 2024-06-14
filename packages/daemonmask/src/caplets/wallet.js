import { E } from '@endo/far';

import { makeExo, names } from '../utils.js';

/**
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/** @param {any} powers */
export const make = async (powers) => {
  const { keyring, provider } = await bootstrap();

  return makeExo('Wallet', {
    /**
     * @param {string} seedPhrase
     * @param {string} infuraProjectId
     */
    async init(seedPhrase, infuraProjectId) {
      await E(keyring).init(seedPhrase);
      await E(provider).init(infuraProjectId);
    },

    async getAddresses() {
      return [await E(keyring).getAddress()];
    },

    /**
     * Make a JSON-RPC request to the node.
     * @param {string} method
     * @param {JsonRpcParams} [params]
     */
    async request(method, params) {
      if (method === 'eth_sendTransaction') {
        throw new Error('not implemented');
      }
      return await E(provider).request(method, params);
    },
  });

  async function bootstrap() {
    if (!(await E(powers).has(names.BUNDLER))) {
      await E(powers).request('SELF', 'Please provide a bundler.', 'bundler');
    }
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
    const _keyring = await E(powers).lookup(names.KEYRING);

    if (!(await E(powers).has(names.PROVIDER))) {
      await E(bundler).makeUnconfined(
        'src/caplets/provider.js',
        names.PROVIDER,
        bundlerPowers,
      );
    }
    const _provider = await E(powers).lookup(names.PROVIDER);

    return { keyring: _keyring, provider: _provider };
  }
};
