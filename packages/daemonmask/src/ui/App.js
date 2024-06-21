import React from 'react';

import { TxForm } from './TxForm.js';
import { TxList } from './TxList.js';

/** @import { Actions } from '../weblet.js' */

/**
 * @param {{ actions: Actions }} props
 */
export const App = ({ actions: { followTransactions, sendTransaction } }) => {
  const txSubscription = followTransactions();

  return React.createElement('div', {}, [
    React.createElement(
      'h1',
      {
        key: 'title',
        style: {
          padding: '4px',
          fontSize: '42px',
          'justify-self': 'center',
        },
      },
      ['😈 DaemonMask 🎭'],
    ),
    React.createElement(TxForm, { sendTransaction }),
    React.createElement(TxList, { txSubscription }),
  ]);
};
