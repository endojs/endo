import { makeRefIterator } from '@endo/daemon';
import { makeChangeTopic } from '@endo/daemon/pubsub.js';
import { E } from '@endo/far';
import { makePromiseKit } from '@endo/promise-kit';

import { makeIdGenerator } from '../../utils.js';

/**
 * @import { Json, Provider } from '@metamask/eth-query'
 * @import { make as makeStore } from './map-store.js'
 */

/**
 * @typedef {object} TxParams
 * @property {string} signature
 */

const TWELVE_SECONDS = 12 * 1000;

const TX_STATUS = {
  SUBMITTED: 'submitted',
  COMPLETED: 'completed',
  ORPHANED: 'orphaned',
};

const nextId = makeIdGenerator();

/**
 * @param {Provider} provider
 * @param {Awaited<ReturnType<makeStore>>} txHistory
 */
export const make = async (provider, txHistory) => {
  const txTopic = makeChangeTopic();

  /**
   * @param {{ id: string, status: string, params: TxParams, receipt?: Record<string, Json> }} txData
   */
  const updateHistory = (txData) => {
    txTopic.publisher.next(txData);
    txHistory.set(txData.id, txData);
  };

  async function* followTransactions() {
    const subsequentTransactions = txTopic.subscribe();
    const existingTransactions = await txHistory.getState();
    yield* Object.values(existingTransactions);
    yield* subsequentTransactions;
  }

  return {
    followTransactions: () => makeRefIterator(followTransactions()),

    /**
     * @param {TxParams} txParams
     */
    async trackTx(txParams) {
      const id = nextId();
      updateHistory({
        id,
        status: TX_STATUS.SUBMITTED,
        params: { ...txParams },
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

          if (receipt !== null) {
            clearInterval(intervalId);
            updateHistory({
              id,
              status: TX_STATUS.COMPLETED,
              params: { ...txParams },
              receipt,
            });
            resolve(receipt);
          }
        } catch (error) {
          clearInterval(intervalId);
          updateHistory({
            id,
            status: TX_STATUS.ORPHANED,
            params: { ...txParams },
          });
          reject(error);
        }
      };

      intervalId = setInterval(pollForReceipt, TWELVE_SECONDS);
      pollForReceipt();
      return promise;
    },
  };
};
