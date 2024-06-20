import { createProvider as createInfuraProvider } from '@metamask/eth-json-rpc-infura';
import { createFetchMiddleware } from '@metamask/eth-json-rpc-middleware';
import { providerFromMiddleware } from '@metamask/eth-json-rpc-provider';
import EthQuery from '@metamask/eth-query';

import { makeExo } from '../utils.js';

let id = 0;
// eslint-disable-next-line no-plusplus
const nextId = () => id++;

/**
 * @import { Provider } from '@metamask/eth-query'
 * @import { JsonRpcParams } from '@metamask/eth-query'
 */

/**
 * @typedef {object} Request
 * @property {(method: string, params?: JsonRpcParams) => Promise<unknown>} request
 */

export const make = () => {
  /** @type {InstanceType<typeof EthQuery> & Request } */
  let ethQuery;

  const assertIsInitialized = () => {
    if (ethQuery === undefined) {
      throw new Error('Provider must be initialized first.');
    }
  };

  return makeExo('Provider', {
    /** @param {{ projectId?: string, rpcUrl?: string }} config */
    init({ projectId, rpcUrl }) {
      /** @type {Provider} */
      let provider;
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

      ethQuery = makeEthQuery(provider);
    },

    /**
     * Make a JSON-RPC request to the node.
     * @param {string} method
     * @param {JsonRpcParams} [params]
     */
    async request(method, params) {
      assertIsInitialized();
      return await ethQuery.request(method, params);
    },
  });
};

/**
 * @param {Provider} provider
 * @returns {InstanceType<typeof EthQuery> & Request} The EthQuery instance.
 */
function makeEthQuery(provider) {
  const ethQuery = new EthQuery(provider);

  /**
   * @param {string} method
   * @param {JsonRpcParams} [params]
   */
  ethQuery.request = (method, params) =>
    new Promise((resolve, reject) => {
      ethQuery.sendAsync(
        {
          jsonrpc: '2.0',
          id: nextId(),
          method,
          params: params ?? [],
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve(result);
          }
        },
      );
    });

  // @ts-expect-error
  return ethQuery;
}
