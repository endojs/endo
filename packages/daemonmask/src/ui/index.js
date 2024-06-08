import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import { createElement } from './util.js';

export const make = async () => {
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

  const appRoot = createRoot(container);
  appRoot.render(createElement(App));
};
