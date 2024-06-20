import { createProvider as createInfuraProvider } from '@metamask/eth-json-rpc-infura';
import { createFetchMiddleware } from '@metamask/eth-json-rpc-middleware';
import { providerFromMiddleware } from '@metamask/eth-json-rpc-provider';

import { makeExo, makeIdGenerator } from '../utils.js';

const nextId = makeIdGenerator();

/**
 * @import { Provider } from '@metamask/eth-query'
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/**
 * @typedef {object} Request
 * @property {(method: string, params?: JsonRpcParams) => Promise<unknown>} request
 */

export const make = () => {
  /** @type {Provider} */
  let provider;

  const assertIsInitialized = () => {
    if (provider === undefined) {
      throw new Error('Provider must be initialized first.');
    }
  };

  return makeExo('Provider', {
    /** @param {{ projectId?: string, rpcUrl?: string }} config */
    init({ projectId, rpcUrl }) {
      if (typeof projectId === 'string') {
        provider = createInfuraProvider({
          network: 'sepolia',
          projectId,
        });
      } else if (typeof rpcUrl === 'string') {
        const middleware = createFetchMiddleware({
          btoa: globalThis.btoa,
          // @ts-expect-error We are at least on Node 18 but TypeScript is unaware
          fetch: globalThis.fetch,
          rpcUrl,
        });
        provider = providerFromMiddleware(middleware);
      } else {
        throw new Error('Either projectId or rpcUrl must be provided.');
      }
    },

    /**
     * Make a JSON-RPC request to the node.
     * @param {string} method
     * @param {JsonRpcParams} [params]
     */
    async request(method, params) {
      assertIsInitialized();
      return new Promise((resolve, reject) => {
        provider.sendAsync(
          {
            jsonrpc: '2.0',
            id: nextId(),
            method,
            params: params ?? [],
          },
          (error, response) => {
            if (error) {
              reject(error);
            } else {
              resolve(response.result);
            }
          },
        );
      });
    },
  });
};
