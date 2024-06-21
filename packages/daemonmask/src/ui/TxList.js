import React from 'react';

import { TxStatus, hexWeiToDecimalEth, hexWeiToDecimalWei } from '../utils.js';

/** @import { Json } from '@metamask/eth-query' */
/** @import { Actions } from '../weblet.js' */

/**
 * Type utility.
 * @returns {any[]}
 */
const makeAnyArray = () => [];

/**
 * @param {{ txData: Record<string, Json> }} props
 */
const TxItem = ({ txData }) => {
  /**
   * @param {string} key
   * @param {Json} value
   */
  const formatValue = (key, value) => {
    if (typeof value === 'object') {
      return JSON.stringify(value, null, 2);
    }
    if (typeof value === 'string') {
      if (key === 'signature' || key.toLowerCase().includes('hash')) {
        return `${value.substring(0, 40)}...`;
      }
      if (key.includes('gas') || key === 'nonce') {
        return hexWeiToDecimalWei(value);
      }
      if (key === 'value') {
        return hexWeiToDecimalEth(value);
      }
    }
    return value.toString();
  };

  return React.createElement(
    'div',
    {
      style: {
        padding: '10px',
        margin: '5px',
        border: '1px solid #ccc',
        borderRadius: '5px',
      },
    },
    [
      React.createElement(
        'ul',
        { style: { listStyleType: 'none', padding: 0 } },
        Object.entries({
          // @ts-expect-error
          ...txData.params,
          ...(txData.receipt === undefined
            ? {}
            : // @ts-expect-error
              { hash: txData.receipt.transactionHash }),
        })
          .sort(([key1], [key2]) => key1.localeCompare(key2))
          .map(([key, value]) =>
            React.createElement('li', { key, style: { marginBottom: '5px' } }, [
              React.createElement('strong', null, [`${key}: `]),
              formatValue(key, value),
            ]),
          ),
      ),
    ],
  );
};

/** @param {Record<string, Json>[]} txList */
const TxItemList = (txList) => {
  if (txList.length === 0) {
    return React.createElement('p', {}, ['No transactions found.']);
  }

  return React.createElement(
    'ul',
    {},
    txList.map((txData) => TxItem({ txData })),
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
          setPendingTxList((prevValue) => [tx, ...prevValue]);
        } else if (tx.status === TxStatus.Completed) {
          setCompletedTxList((prevValue) => [tx, ...prevValue]);
          setPendingTxList((prevValue) =>
            prevValue.filter((pendingTx) => pendingTx.id !== tx.id),
          );
        } else {
          console.warn(`Unhandled orphaned transaction: ${tx.toString()}`);
        }
      }
    };

    consumeIterator().catch(console.error);
  }, [txSubscription]);

  return React.createElement('div', { style: { margin: '0 10%' } }, [
    React.createElement('h2', {}, ['Pending Transactions']),
    TxItemList(pendingTxList),
    React.createElement('h2', {}, ['Completed Transactions']),
    TxItemList(completedTxList),
  ]);
};
