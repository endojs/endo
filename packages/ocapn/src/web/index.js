// @ts-check
/* global document,window */

import { E } from '@endo/eventual-send';

import { makeWebSocketClientNetLayer } from '../netlayers/web-socket/client.js';
import { makeClient } from '../client/index.js';
import { encodeSwissnum } from '../client/util.js';

const main = async () => {
  // Config

  const urlParams = new URLSearchParams(window.location.search);
  const wsAddress = urlParams.get('ws') || 'ws://localhost:8080';
  const fnSwissnum = urlParams.get('fnSwissnum');
  if (!fnSwissnum) {
    console.error('swissnum is required');
    return;
  }

  const location = {
    /** @type {import('../codecs/components.js').OcapnLocation['type']} */
    type: 'ocapn-node',
    transport: 'websocket',
    address: wsAddress,
    hints: false,
  };

  // Initialization

  const client = makeClient({ debugLabel: 'LightbulbManipulator' });
  const webSocketNetlayer = await makeWebSocketClientNetLayer({ client });
  client.registerNetlayer(webSocketNetlayer);
  console.log('registered netlayer');

  const { ocapn } = await client.provideSession(location);
  console.log('provided session');
  const bootstrap = await ocapn.getBootstrap();
  console.log('got bootstrap');
  const routeFn = await E(bootstrap).fetch(encodeSwissnum(fnSwissnum));
  console.log('got routeFn');

  // UI instrumentation

  const manipulateLightbulbButton = document.getElementById('manipulate-lightbulb');
  if (!manipulateLightbulbButton) {
    throw new Error('manipulateLightbulbButton not found');
  }
  manipulateLightbulbButton.addEventListener('click', async () => {
    console.log('calling routeFn', routeFn);
    await E(routeFn)();
    console.log('routeFn called');
  });

  const shutdownButton = document.getElementById('shutdown');
  if (!shutdownButton) {
    throw new Error('shutdownButton not found');
  }
  shutdownButton.addEventListener('click', () => {
    client.shutdown();
  });
};

await main();
