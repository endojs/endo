// @ts-check

import { E } from '@endo/eventual-send';
import { Far } from '@endo/marshal';
import { test } from './_util.js';
import { makeClient } from '../src/client/index.js';
import { makeWebSocketNetLayer } from '../src/netlayers/websocket.js';
import { encodeSwissnum } from '../src/client/util.js';

test('websocket netlayer establishes session and delivers messages', async t => {
  const objectTable = new Map();
  objectTable.set(
    'Echo',
    Far('echo', {
      echo: value => value,
    }),
  );

  const clientA = makeClient({ debugLabel: 'ws-A', debugMode: true });
  const clientB = makeClient({
    debugLabel: 'ws-B',
    swissnumTable: objectTable,
    debugMode: true,
  });

  const netlayerA = await clientA.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );
  const netlayerB = await clientB.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );

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
  const clientA = makeClient({ debugLabel: 'ws-auth-A', debugMode: true });
  const clientB = makeClient({ debugLabel: 'ws-auth-B', debugMode: true });

  await clientA.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );
  const netlayerB = await clientB.registerNetlayer((handlers, logger) =>
    makeWebSocketNetLayer({ handlers, logger }),
  );

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
