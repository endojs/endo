import { makeChangeTopic } from '@endo/daemon/pubsub.js';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { makeIdGenerator, TxStatus } from '../../utils.js';

/**
 * @import { Json, Provider } from '@metamask/eth-query'
 * @import { make as makeStore } from './map-store.js'
 */

/**
 * @typedef {object} TxParams
 * @property {string} signature
 */

const TWELVE_SECONDS = 12 * 1000;

const nextId = makeIdGenerator();

/**
 * @param {Provider} provider
 * @param {Awaited<ReturnType<makeStore>>} txHistory
 */
export const make = async (provider, txHistory) => {
  const txTopic = makeChangeTopic();

  /**
   * @param {{ id: string, status: string, params: TxParams, receipt?: Record<string, Json>, hash?: string }} txData
   */
  const updateHistory = async (txData) => {
    txTopic.publisher.next(txData);
    await txHistory.set(txData.id, txData);
  };

  async function* followTransactions() {
    const subsequentTransactions = txTopic.subscribe();
    const existingTransactions = await txHistory.getState();
    yield* Object.values(existingTransactions);
    yield* subsequentTransactions;
  }

  return {
    followTransactions: () => followTransactions(),

    /**
     * @param {TxParams} txParams
     */
    async trackTx(txParams) {
      const id = nextId();
      await updateHistory({
        id,
        status: TxStatus.Submitted,
        params: { ...txParams },
      });

      /**
       * @param {string} txHash
       */
      const storeTxReceipt = (txHash) => {
        /** @type {ReturnType<setInterval>} */
        let intervalId; // eslint-disable-line prefer-const
        const { promise, resolve, reject } = makePromiseKit();
        const pollForReceipt = async () => {
          try {
            const receipt = await E(provider).request(
              'eth_getTransactionReceipt',
              [txHash],
            );

            if (receipt !== null) {
              clearInterval(intervalId);
              await updateHistory({
                id,
                status: TxStatus.Completed,
                params: { ...txParams },
                receipt,
              });
              resolve(receipt);
            }
          } catch (error) {
            clearInterval(intervalId);
            await updateHistory({
              id,
              status: TxStatus.Orphaned,
              params: { ...txParams },
              hash: txHash,
            });
            reject(error);
          }
        };

        intervalId = setInterval(pollForReceipt, TWELVE_SECONDS);
        pollForReceipt();
        return promise;
      };
      return storeTxReceipt;
    },
  };
};
