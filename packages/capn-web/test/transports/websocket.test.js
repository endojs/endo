// @ts-nocheck
// Test the WebSocket transport using a fake WebSocket pair that mirrors the
// browser interface (addEventListener / send / close / readyState).  A real
// WebSocket library isn't required.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeWebSocketTransport } from '../../src/index.js';

const makeFakeWebSocketPair = () => {
  const make = (mySend, registerListeners) => {
    const listeners = { message: [], close: [], error: [], open: [] };
    registerListeners(listeners);
    return {
      readyState: 1, // OPEN
      addEventListener: (type, fn) => {
        listeners[type].push(fn);
      },
      send: msg => {
        // Async-deliver to the peer.
        Promise.resolve().then(() => mySend(msg));
      },
      close: () => {
        for (const fn of listeners.close) fn({});
      },
    };
  };
  let aSendListeners;
  let bSendListeners;
  const a = make(
    msg => {
      for (const fn of bSendListeners.message) fn({ data: msg });
    },
    ls => {
      aSendListeners = ls;
    },
  );
  const b = make(
    msg => {
      for (const fn of aSendListeners.message) fn({ data: msg });
    },
    ls => {
      bSendListeners = ls;
    },
  );
  return { a, b };
};

test('websocket transport: round-trip call', async t => {
  const { a, b } = makeFakeWebSocketPair();
  const sessionA = makeCapnWebSession(makeWebSocketTransport(a), {
    gcImports: false,
  });
  const sessionB = makeCapnWebSession(makeWebSocketTransport(b), {
    localMain: Far('s', { hi: name => `hi ${name}` }),
    gcImports: false,
  });
  sessionB;
  t.is(await E(sessionA.getRemoteMain()).hi('there'), 'hi there');
  sessionA.abort();
});
