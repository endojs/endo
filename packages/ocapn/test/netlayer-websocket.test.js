// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { test } from './_util.js';
import { makeOcapn } from '../src/client/index.js';
import { makeWebSocketNetLayer } from '../src/netlayers/websocket.js';
import { encodeSwissnum } from '../src/client/util.js';
import { syrupCodec } from '../src/syrup/index.js';

/**
 * @template T
 * @typedef {{ netlayer?: T }} NetlayerRef
 */

/**
 * Wrap `makeWebSocketNetLayer` so its resolved netlayer is captured in
 * `netlayerRef.netlayer`, since the single-network `makeOcapn` API does
 * not otherwise expose the underlying network for the test to inspect.
 *
 * @param {NetlayerRef<Awaited<ReturnType<typeof makeWebSocketNetLayer>>>} netlayerRef
 */
const captureWebSocketNetLayer = netlayerRef => (handlers, logger) =>
  makeWebSocketNetLayer({ handlers, logger }).then(netlayer => {
    netlayerRef.netlayer = netlayer;
    return netlayer;
  });

test('websocket netlayer establishes session and delivers messages', async t => {
  const objectTable = new Map();
  objectTable.set(
    'Echo',
    Far('echo', {
      echo: value => value,
    }),
  );

  /** @type {NetlayerRef<Awaited<ReturnType<typeof makeWebSocketNetLayer>>>} */
  const netlayerRefA = {};
  /** @type {NetlayerRef<Awaited<ReturnType<typeof makeWebSocketNetLayer>>>} */
  const netlayerRefB = {};

  const clientA = await makeOcapn({
    codec: syrupCodec,
    network: captureWebSocketNetLayer(netlayerRefA),
    debugLabel: 'ws-A',
    debugMode: true,
  });
  const clientB = await makeOcapn({
    codec: syrupCodec,
    network: captureWebSocketNetLayer(netlayerRefB),
    debugLabel: 'ws-B',
    locator: objectTable,
    debugMode: true,
  });

  if (!netlayerRefA.netlayer || !netlayerRefB.netlayer) {
    throw Error('makeWebSocketNetLayer did not resolve a netlayer');
  }
  const netlayerA = netlayerRefA.netlayer;
  const netlayerB = netlayerRefB.netlayer;

  try {
    // eslint-disable-next-line no-underscore-dangle
    const debugA = clientA._debug;
    // eslint-disable-next-line no-underscore-dangle
    const debugB = clientB._debug;
    t.truthy(debugA);
    t.truthy(debugB);
    if (!debugA || !debugB) {
      throw Error('Expected debug mode clients');
    }
    const sessionA = await debugA.provideInternalSession(netlayerB.location);
    await debugB.provideInternalSession(netlayerA.location);

    const bootstrap = sessionA.ocapn.getRemoteBootstrap();
    const echoRef = await E(bootstrap).fetch(encodeSwissnum('Echo'));
    const echoed = await E(echoRef).echo('hello websocket');
    t.is(echoed, 'hello websocket');
  } finally {
    clientA.shutdown();
    clientB.shutdown();
  }
});

test('websocket netlayer rejects peer with mismatched designator', async t => {
  /** @type {NetlayerRef<Awaited<ReturnType<typeof makeWebSocketNetLayer>>>} */
  const netlayerRefA = {};
  /** @type {NetlayerRef<Awaited<ReturnType<typeof makeWebSocketNetLayer>>>} */
  const netlayerRefB = {};

  const clientA = await makeOcapn({
    codec: syrupCodec,
    network: captureWebSocketNetLayer(netlayerRefA),
    debugLabel: 'ws-auth-A',
    debugMode: true,
  });
  const clientB = await makeOcapn({
    codec: syrupCodec,
    network: captureWebSocketNetLayer(netlayerRefB),
    debugLabel: 'ws-auth-B',
    debugMode: true,
  });

  if (!netlayerRefB.netlayer) {
    throw Error('makeWebSocketNetLayer did not resolve a netlayer');
  }
  const netlayerB = netlayerRefB.netlayer;

  const badLocation = {
    ...netlayerB.location,
    designator: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  };

  try {
    // eslint-disable-next-line no-underscore-dangle
    const debugA = clientA._debug;
    t.truthy(debugA);
    if (!debugA) {
      throw Error('Expected debug mode client');
    }
    const sessionPromise = clientA.provideSession(badLocation);
    const err = await t.throwsAsync(() => sessionPromise, {
      instanceOf: Error,
    });
    t.regex(
      err.message,
      /Connection closed during handshake|Session ended/,
      'session establishment should fail on invalid designator proof',
    );

    const active = debugA.sessionManager.getActiveSession(netlayerB.locationId);
    t.is(active, undefined);
  } finally {
    clientA.shutdown();
    clientB.shutdown();
  }
});
