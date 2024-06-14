import { createProvider } from '@metamask/eth-json-rpc-infura';
import EthQuery from '@metamask/eth-query';

import { makeExo } from '../utils.js';

let id = 0;
// eslint-disable-next-line no-plusplus
const nextId = () => id++;

/**
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
    /** @param {string} projectId */
    init(projectId) {
      const provider = createProvider({
        network: 'sepolia',
        projectId,
      });

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
 * @param {ReturnType<typeof createProvider>} provider
 * @returns {InstanceType<typeof EthQuery> & Request} The EthQuery isntance.
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
