// @ts-check
/* global window, document */

import '@endo/init/debug.js';
import { makeCapTP } from '@endo/captp';
import { E, Far } from '@endo/far';
import { importBundle } from '@endo/import-bundle';
import { transforms } from 'ses/tools.js';

const hardenedEndowments = harden({
  assert,
  E,
  Far,
  TextEncoder,
  TextDecoder,
  URL,
});

const endowments = Object.freeze({
  ...hardenedEndowments,
  window,
  document,
  console,
  // react-dom compat
  process: {
    env: {}
  },
  Math,
  navigator,
  // react compat
  Date,
  MessageChannel,
});

const url = new URL('/', `${window.location}`);
url.protocol = 'ws';

const bootstrap = Far('WebFacet', {
  ping() {
    console.log('received ping');
    return 'pong';
  },
  async importBundleAndEndow(bundle, powers) {
    const namespace = await importBundle(bundle, {
      endowments,
      transforms: [
        transforms.evadeHtmlCommentTest,
      ],
    });
    return namespace.make(powers);
  },
  reject(message) {
    document.body.innerHTML = '';
    const $title = document.createElement('h1');
    $title.innerText = `💔 ${message}`;
    document.body.appendChild($title);
  },
});

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const ws = new WebSocket(url.href);
ws.binaryType = 'arraybuffer';
ws.addEventListener('open', () => {
  const send = message => {
    // console.log('send', message);
    ws.send(textEncoder.encode(JSON.stringify(message)));
  };
  const { dispatch, abort } = makeCapTP('WebClient', send, bootstrap);
  ws.addEventListener('message', event => {
    const message = JSON.parse(textDecoder.decode(event.data));
    // console.log('received', message);
    dispatch(message);
  });
  ws.addEventListener('close', () => {
    abort();
  });
});

document.body.innerHTML = '<h1>⌛️</h1>';
