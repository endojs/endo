// @ts-nocheck
/* global setTimeout */
// HTTP batch transport.  We test the client-side batching using a fake fetch
// that simulates a server: it parses the request body, runs a session
// against it, captures outgoing messages, and returns them as the response
// body.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeHttpBatchTransport } from '../../src/index.js';

const makeServerFetch = localMain => {
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
        if (/** @type {string[]} */ (inLines).length > 0)
          return Promise.resolve(inLines.shift());
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
    session;
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
  // The transport stays open across batches; explicit abort to free
  // event-loop handles before test exit.
  session.abort();
});

test('http-batch transport: surfaces non-2xx as transport close', async t => {
  let onErrorCalled;
  const fetch = async () => ({ ok: false, status: 500, statusText: 'oops' });
  const transport = makeHttpBatchTransport('https://example.com/rpc', {
    fetch,
    onError: e => {
      onErrorCalled = e;
    },
  });
  const session = makeCapnWebSession(transport, { gcImports: false });
  const r = session.getRemoteMain();
  let caught;
  try {
    await E(r).anything();
  } catch (e) {
    caught = e;
  }
  // Some kind of failure surfaces — either via the call rejecting (because
  // the session aborted on transport close) or the onError callback firing.
  t.true(Boolean(caught) || Boolean(onErrorCalled));
  session.abort();
});
