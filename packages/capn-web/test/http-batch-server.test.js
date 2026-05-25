// @ts-nocheck
/* global globalThis, Request, setTimeout */
// Server-side HTTP batch helpers — round-trip the client transport and the
// server `processHttpBatchBody` / `handleHttpBatchRequest`.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import {
  makeCapnWebSession,
  makeHttpBatchTransport,
  processHttpBatchBody,
  handleHttpBatchRequest,
} from '../src/index.js';

test('processHttpBatchBody: simple call', async t => {
  const fetch = async (_url, init) => ({
    ok: true,
    status: 200,
    text: async () =>
      processHttpBatchBody(init.body, {
        localMain: Far('s', { hello: name => `Hello, ${name}!` }),
      }),
  });
  const session = makeCapnWebSession(
    makeHttpBatchTransport('https://example.com/rpc', { fetch }),
    { gcImports: false },
  );
  t.is(
    await E(session.getRemoteMain()).hello('batch-server'),
    'Hello, batch-server!',
  );
  session.abort();
});

test('processHttpBatchBody: empty body yields empty body', async t => {
  const out = await processHttpBatchBody('', {
    localMain: Far('s', { ping: () => 'pong' }),
  });
  t.is(out, '');
});

test('processHttpBatchBody: waits for slow async handler before flushing response', async t => {
  // Regression: drain() previously only awaited outgoing-side state and
  // could return before an incoming handler's async body finished
  // computing (because the handlePush returns synchronously after
  // installing the answer, and the matching pull's await happens later).
  // A method whose answer arrives only after multiple turns must still
  // be present in the batch response.
  const slow = async () => {
    await new Promise(r => setTimeout(r, 30));
    return 'late';
  };
  const out = await processHttpBatchBody(
    '["push",["pipeline",0,["slow"],[]]]\n["pull",1]',
    { localMain: Far('s', { slow }) },
  );
  t.true(
    out.includes('"resolve"') && out.includes('"late"'),
    `expected resolve+late, got: ${out}`,
  );
});

// NOTE: bidirectional capability passing inside a single HTTP batch is not
// supported by the HTTP-batch transport — the server can't initiate
// callbacks to the client within one request/response round-trip.  Use the
// WebSocket or MessagePort transports for that.

const haveFetchTypes =
  typeof globalThis.Request === 'function' &&
  typeof globalThis.Response === 'function';

const fetchTest = haveFetchTypes ? test : test.skip;

fetchTest('handleHttpBatchRequest: returns a Response', async t => {
  const req = new Request('https://example.com/rpc', {
    method: 'POST',
    headers: { 'content-type': 'text/plain; charset=utf-8' },
    body: '["push",["pipeline",0,["echo"],["hi"]]]\n["pull",1]',
  });
  const res = await handleHttpBatchRequest(req, {
    localMain: Far('s', { echo: x => x }),
  });
  t.is(res.status, 200);
  const text = await res.text();
  // Should contain a resolve message for id 1 carrying "hi".
  t.true(text.includes('"resolve"'));
  t.true(text.includes('"hi"'));
});

fetchTest('handleHttpBatchRequest: rejects non-POST with 405', async t => {
  const req = new Request('https://example.com/rpc', { method: 'GET' });
  const res = await handleHttpBatchRequest(req, {
    localMain: Far('s', {}),
  });
  t.is(res.status, 405);
});
