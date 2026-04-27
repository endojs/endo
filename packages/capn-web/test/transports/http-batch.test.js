// HTTP batch transport.  We test the client-side batching using a fake fetch
// that simulates a server: it parses the request body, runs a session
// against it, captures outgoing messages, and returns them as the response
// body.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import {
  makeCapnWebSession,
  makeHttpBatchTransport,
} from '../../src/index.js';

const makeServerFetch = (localMain) => {
  return async (_url, init) => {
    const inLines = init.body ? init.body.split('\n') : [];
    /** @type {string[]} */
    const outLines = [];
    /** @type {Array<(s: string | null) => void>} */
    const outWaiters = [];
    let closed = false;
    const transport = {
      send: m => {
        outLines.push(m);
      },
      receive: () => {
        if (inLines.length > 0) return Promise.resolve(inLines.shift());
        if (closed) return Promise.resolve(null);
        return new Promise(resolve => outWaiters.push(resolve));
      },
      abort: () => {
        closed = true;
      },
    };
    const session = makeCapnWebSession(transport, {
      localMain,
      gcImports: false,
    });
    void session;
    // Allow processing turns.  Run several macrotasks to let the session
    // chew through all input and produce all outputs.
    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise(resolve => setTimeout(resolve, 5));
      if (inLines.length === 0) break;
    }
    closed = true;
    for (const w of outWaiters.splice(0)) w(null);
    return {
      ok: true,
      text: async () => outLines.join('\n'),
    };
  };
};

test('http-batch transport: simple call', async t => {
  const fetch = makeServerFetch(
    Far('s', {
      hello: name => `Hello, ${name}!`,
    }),
  );
  const transport = makeHttpBatchTransport('https://example.com/rpc', {
    fetch,
  });
  const session = makeCapnWebSession(transport, { gcImports: false });
  const r = session.getRemoteMain();
  t.is(await E(r).hello('batch'), 'Hello, batch!');
});
