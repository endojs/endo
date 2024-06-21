import { makeIteratorRef } from '@endo/daemon';
import { E } from '@endo/far';

import { isObject, makeExo, Name } from '../utils.js';
import { make as makeStore } from './subcomponents/map-store.js';
import { make as makeTxTracker } from './subcomponents/tx-tracker.js';

/**
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/** @param {any} powers */
export const make = async (powers) => {
  const { keyring, provider, txTracker } = await bootstrap();

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

    followTransactions: () => makeIteratorRef(txTracker.followTransactions()),

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
          !isObject(params[0]) ||
          !params[0].from
        ) {
          throw new Error(
            'Expected valid transaction parameters for eth_sendTransaction',
          );
        }

        const txParams = { ...params[0] };
        const nonce = await E(provider).request('eth_getTransactionCount', [
          txParams.from,
          'latest',
        ]);
        txParams.nonce = nonce;

        const chainId = await E(provider).request('eth_chainId');
        const txSignature = await E(keyring).signTransaction(
          { ...txParams },
          chainId,
        );
        const signedTxParams = { ...txParams, chainId, signature: txSignature };
        txTracker.trackTx(signedTxParams);

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
    const bundler = await E(powers).lookup(Name.Bundler);

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

    if (!(await E(powers).has(Name.Keyring))) {
      await E(bundler).makeUnconfined(
        'src/caplets/keyring.js',
        Name.Keyring,
        bundlerPowers,
      );
    }

    if (!(await E(powers).has(Name.Provider))) {
      await E(bundler).makeUnconfined(
        'src/caplets/provider.js',
        Name.Provider,
        bundlerPowers,
      );
    }

    const _keyring = await E(powers).lookup(Name.Keyring);
    const _provider = await E(powers).lookup(Name.Provider);
    const txHistory = await makeStore(Name.Transactions, powers);
    const _txTracker = await makeTxTracker(_provider, txHistory);

    return {
      keyring: _keyring,
      provider: _provider,
      txTracker: _txTracker,
    };
  }
};
