import { makeRefIterator } from '@endo/daemon/ref-reader.js';
import { E } from '@endo/far';

import { make as makeApp } from './ui/index.js';
import { Name } from './utils.js';

/** @import { Json } from '@metamask/eth-query' */

/**
 * @typedef {object} Actions
 * @property {() => ReturnType<typeof makeRefIterator>} followTransactions
 * @property {(txParams: Record<string, Json>) => Promise<string>} sendTransaction
 * @property {(method: string, params: Json[]) => Promise<any>} request
 */

/**
 * @param {any} powers
 */
export const make = async (powers) => {
  if (!(await E(powers).has(Name.Wallet))) {
    throw new Error('Wallet must be initialized first.');
  }
  const wallet = await E(powers).lookup(Name.Wallet);

  /**
   * @type {Actions['request']}
   */
  const request = (method, params) => E(wallet).request(method, params);

  /** @type {Actions} */
  const actions = {
    followTransactions: () => makeRefIterator(E(wallet).followTransactions()),
    /** @param {Record<string, Json>} txParams */
    sendTransaction: (txParams) => request('eth_sendTransaction', [txParams]),
    request,
  };

  return makeApp({ actions });
};
