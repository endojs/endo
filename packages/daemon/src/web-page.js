// @ts-check
/* global globalThis, window, document */

import '@endo/init/debug.js';
import { makeCapTP } from '@endo/captp';
import { E, Far } from '@endo/far';
import { M } from '@endo/patterns';
import { makeExo } from '@endo/exo';
import { importBundle } from '@endo/import-bundle';
import { transforms } from 'ses/tools.js';

import { WebPageControllerInterface } from './interfaces/web.js';

const getPrototypeChain = obj => {
  const chain = [];
  while (obj) {
    chain.push(obj);
    obj = Object.getPrototypeOf(obj);
  }
  return chain;
};
const collectPropsAndBind = target => {
  const container = {};
  for (const obj of getPrototypeChain(target)) {
    for (const [name, propDesc] of Object.entries(
      Object.getOwnPropertyDescriptors(obj),
    )) {
      if (name in container) {
        // eslint-disable-next-line no-continue
        continue;
      }
      let value = propDesc.value;
      if (propDesc.get) {
        value = propDesc.get.call(target);
      }
      if (typeof value === 'function') {
        // This wrapper is a bind that works for constructors as well.
        const wrapper = function bindWrapperFn(...args) {
          if (new.target) {
            // eslint-disable-next-line new-cap
            return new value(...args);
          } else {
            return value.call(target, ...args);
          }
        };
        Object.defineProperties(
          wrapper,
          Object.getOwnPropertyDescriptors(value),
        );
        container[name] = wrapper;
      } else {
        container[name] = value;
      }
    }
  }
  return container;
};

const hardenedEndowments = harden({
  // See https://github.com/Agoric/agoric-sdk/issues/9515
  assert: globalThis.assert,
  E,
  Far,
  makeExo,
  M,
  TextEncoder,
  TextDecoder,
  URL,
});

const globalProps = collectPropsAndBind(window);
// These properties conflict with Compartment globals.
delete globalProps.undefined;
delete globalProps.NaN;
delete globalProps.Infinity;

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
  // app
  requestAnimationFrame,
  cancelAnimationFrame,
});

const url = new URL(window.location.href);
url.protocol = 'ws';

const bootstrap = makeExo('EndoWebPageForServer', WebPageControllerInterface, {
  ping() {
    console.log('received ping');
    return 'pong';
  },
  async makeBundle(bundle, powers) {
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
