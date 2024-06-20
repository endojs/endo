import { makeRefIterator } from '@endo/daemon';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

/**
 * @import { Provider } from '@metamask/eth-query'
 */

/**
 * @typedef {object} TxParams
 * @property {string} signature
 */

const ELEVEN_SECONDS = 11 * 1000;

const TX_STATUS = {
  SUBMITTED: 'submitted',
  COMPLETED: 'completed',
  ORPHANED: 'orphaned',
};

/**
 * @param {Provider} provider
 */
export const make = async (provider) => {
  const txTopic = makeChangeTopic();

  return {
    followTransactions: () => makeRefIterator(txTopic.subscribe()),

    /**
     * @param {TxParams} txParams
     */
    async trackTx(txParams) {
      txTopic.publisher.next({
        status: TX_STATUS.SUBMITTED,
        value: { params: { ...txParams } },
      });

      /** @type {ReturnType<setInterval>} */
      let intervalId; // eslint-disable-line prefer-const
      const { promise, resolve, reject } = makePromiseKit();
      const pollForReceipt = async () => {
        try {
          const receipt = await E(provider).request(
            'eth_getTransactionReceipt',
            [txParams.signature],
          );

          if (typeof receipt === 'string') {
            clearInterval(intervalId);
            txTopic.publisher.next({
              status: TX_STATUS.COMPLETED,
              value: { params: { ...txParams }, receipt },
            });
            resolve(receipt);
          }
        } catch (error) {
          clearInterval(intervalId);
          txTopic.publisher.next({
            status: TX_STATUS.ORPHANED,
            value: { params: { ...txParams } },
          });
          reject(error);
        }
      };

      intervalId = setInterval(pollForReceipt, ELEVEN_SECONDS);
      pollForReceipt();
      return promise;
    },
  };
};
