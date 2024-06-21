import React from 'react';

import { TxStatus } from '../utils.js';

/** @import { Json } from '@metamask/eth-query' */
/** @import { Actions } from '../weblet.js' */

/**
 * Type utility.
 * @returns {any[]}
 */
const makeAnyArray = () => [];

/**
 * @param {Record<string, Json>} txData
 */
const TxItem = (txData) => {
  const truncatedTxParams = {
    // @ts-expect-error
    ...txData.params,
    // @ts-expect-error
    signature: `${txData.params.signature.substring(0, 40)}...`,
  };

  return React.createElement('li', {}, [
    React.createElement('pre', {}, [
      React.createElement('code', {}, [
        JSON.stringify(truncatedTxParams, null, 2),
      ]),
    ]),
  ]);
};

/** @param {Record<string, Json>[]} txList */
const TxItemList = (txList) => {
  if (txList.length === 0) {
    return React.createElement('p', {}, ['No transactions found.']);
  }

  return React.createElement(
    'ul',
    {},
    txList.map((tx) => TxItem(tx)),
  );
};

/**
 * @param {{ txSubscription: ReturnType<Actions['followTransactions']>}} props
 */
export const TxList = ({ txSubscription }) => {
  const [pendingTxList, setPendingTxList] = React.useState(makeAnyArray());
  const [completedTxList, setCompletedTxList] = React.useState(makeAnyArray());

  React.useEffect(() => {
    const consumeIterator = async () => {
      for await (const tx of txSubscription) {
        if (tx.status === TxStatus.Submitted) {
          setPendingTxList((prevValue) => [...prevValue, tx]);
        } else if (tx.status === TxStatus.Completed) {
          setCompletedTxList((prevValue) => [...prevValue, tx]);
        } else {
          console.warn(`Unhandled orphaned transaction: ${tx.toString()}`);
        }
      }
    };

    consumeIterator().catch(console.error);
  }, [txSubscription]);

  return React.createElement('div', {}, [
    React.createElement('h2', {}, ['Pending Transactions']),
    TxItemList(pendingTxList),
    React.createElement('h2', {}, ['Completed Transactions']),
    TxItemList(completedTxList),
  ]);
};
