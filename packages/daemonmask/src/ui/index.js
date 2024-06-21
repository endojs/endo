import React from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';

/** @import { Actions } from '../weblet.js' */

/**
 * @param {{ actions: Actions }} params
 */
export const make = async ({ actions }) => {
  document.body.innerHTML = '';

  const style = document.createElement('style');
  style.innerHTML = `
    html, body {
      box-sizing: border-box;
      margin: 0;
      height: 100%;
    }
    body {
      padding: 12px;
      font-family: sans-serif;
      background: #e3e3e3;
      display: grid;
    }
    div {
      display: grid;
    }
  `;
  document.body.appendChild(style);

  const container = document.createElement('div');
  document.body.appendChild(container);

  const appRoot = createRoot(container);
  appRoot.render(React.createElement(App, { actions }));
};
