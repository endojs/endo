// Use Node's worker_threads MessageChannel as a real MessagePort.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';
import { MessageChannel } from 'node:worker_threads';

import {
  makeCapnWebSession,
  makeMessagePortTransport,
} from '../../src/index.js';

test('messageport transport: round-trip call', async t => {
  const { port1, port2 } = new MessageChannel();
  const sessionA = makeCapnWebSession(makeMessagePortTransport(port1), {
    gcImports: false,
  });
  const sessionB = makeCapnWebSession(makeMessagePortTransport(port2), {
    localMain: Far('s', { add: (a, b) => a + b }),
    gcImports: false,
  });
  sessionB;
  t.is(await E(sessionA.getRemoteMain()).add(40, 2), 42);
  sessionA.abort();
});

test('messageport transport: bidirectional pipelining', async t => {
  const { port1, port2 } = new MessageChannel();
  const helper = Far('helper', { sq: x => x * x });
  const sessionA = makeCapnWebSession(makeMessagePortTransport(port1), {
    gcImports: false,
  });
  const sessionB = makeCapnWebSession(makeMessagePortTransport(port2), {
    localMain: Far('s', {
      use: async (h, x) => E(h).sq(x),
    }),
    gcImports: false,
  });
  sessionB;
  t.is(await E(sessionA.getRemoteMain()).use(helper, 9), 81);
  sessionA.abort();
});
