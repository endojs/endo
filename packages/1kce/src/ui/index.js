/* global document */

import { createRoot } from 'react-dom/client';
import { h } from './util.js';
import { App } from './app.js';

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
    }
  `;
  document.body.appendChild(style);

  const container = document.createElement('div');
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(h(App, { actions }));
};
