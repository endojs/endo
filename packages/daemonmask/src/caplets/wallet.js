import { E } from '@endo/far';

import { isObject, makeExo, names } from '../utils.js';
import { make as makeStore } from './subcomponents/array-store.js';
import { make as makeTxTracker } from './subcomponents/tx-tracker.js';

/**
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/** @param {any} powers */
export const make = async (powers) => {
  const { keyring, provider, txHistory, txTracker } = await bootstrap();

  let isInitialized = false;
  const assertIsInitialized = () => {
    if (!isInitialized) {
      throw new Error('Wallet must be initialized first.');
    }
  };

  return makeExo('Wallet', {
    /**
     * @param {string} seedPhrase
     * @param {{ projectId?: string, rpcUrl?: string}} providerConfig
     */
    async init(seedPhrase, providerConfig) {
      await E(keyring).init(seedPhrase);
      await E(provider).init(providerConfig);
      isInitialized = true;
    },

    async getAddresses() {
      assertIsInitialized();
      return [await E(keyring).getAddress()];
    },

    followTransactions: () => txTracker.followTransactions(),

    /**
     * Make a JSON-RPC request to the node.
     * @param {string} method
     * @param {JsonRpcParams} [params]
     */
    async request(method, params) {
      assertIsInitialized();
      if (method === 'eth_sendTransaction') {
        if (
          !Array.isArray(params) ||
          params.length !== 1 ||
          !isObject(params[0])
        ) {
          throw new Error(
            'Expected valid transaction parameters for eth_sendTransaction',
          );
        }

        const chainId = await E(provider).request('eth_chainId');
        const txSignature = await E(keyring).signTransaction(
          { ...params[0] },
          chainId,
        );
        const txParams = { ...params[0], signature: txSignature };
        txTracker.trackTx(txParams);
        await txHistory.push({ txParams });

        return await E(provider).request('eth_sendRawTransaction', [
          txSignature,
        ]);
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

    const _keyring = await E(powers).lookup(names.KEYRING);
    const _provider = await E(powers).lookup(names.PROVIDER);
    const _txHistory = await makeStore(names.TRANSACTIONS, powers);
    const _txTracker = await makeTxTracker(provider);

    return {
      keyring: _keyring,
      provider: _provider,
      txHistory: _txHistory,
      txTracker: _txTracker,
    };
  }
};
