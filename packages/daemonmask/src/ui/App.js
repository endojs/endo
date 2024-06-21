import React from 'react';

import { TxList } from './TxList.js';

/** @import { Actions } from '../weblet.js' */

/**
 * @param {{ actions: Actions }} props
 */
export const App = ({ actions }) => {
  const txSubscription = actions.followTransactions();

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
    React.createElement(TxList, { txSubscription }),
  ]);
};
