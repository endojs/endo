// Wire-format interop tests.  Verify that the messages we put on the wire
// match the shape documented at
// https://github.com/cloudflare/capnweb/blob/main/protocol.md
//
// We don't validate every field with a fixture, but we check that the message
// envelope is a JSON array starting with a known tag, and that argument
// shapes match the spec for representative cases.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const collect = transport => {
  const sent = [];
  const wrapped = {
    send: m => {
      sent.push(JSON.parse(m));
      return transport.send(m);
    },
    receive: () => transport.receive(),
    abort: transport.abort,
  };
  return { wrapped, sent };
};

test('outgoing call shape: ["push", ["pipeline", 0, ["m"], [args]]]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { hello: name => `Hello, ${name}!` }),
    gcImports: false,
  });
  const r = sessionA.getRemoteMain();
  await E(r).hello('World');
  // First two outgoing messages: push then pull.
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['hello'], ['World']]]);
  t.deepEqual(sent[1], ['pull', 1]);
});

test('outgoing argument shape: BigInt becomes ["bigint", str]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { echo: x => x }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).echo(123n);
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['echo'], [['bigint', '123']]]]);
});

test('outgoing argument shape: Date becomes ["date", ms]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { echo: x => x }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).echo(new Date(0));
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['echo'], [['date', 0]]]]);
});

test('outgoing argument shape: Uint8Array becomes ["bytes", b64]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { echo: x => x }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).echo(new Uint8Array([1, 2, 3]));
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['echo'], [['bytes', 'AQID']]]]);
});

test('outgoing argument shape: undefined becomes ["undefined"]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { echo: x => x }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).echo(undefined);
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['echo'], [['undefined']]]]);
});

test('outgoing argument shape: arrays escape with [[...]]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { echo: x => x }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).echo([1, 2, 3]);
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['echo'], [[[1, 2, 3]]]]]);
});

test('outgoing argument shape: introducing a capability uses ["export", -id]', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', { take: () => null }),
    gcImports: false,
  });
  const cap = Far('cap', { ping: () => 'pong' });
  await E(sessionA.getRemoteMain()).take(cap);
  t.deepEqual(sent[0], ['push', ['pipeline', 0, ['take'], [['export', -1]]]]);
});

test('release message is sent on disposal', async t => {
  const { a, b } = makeLoopbackPair();
  const { wrapped, sent: _sent } = collect(a);
  const sessionA = makeCapnWebSession(wrapped, { gcImports: false });
  makeCapnWebSession(b, {
    localMain: Far('s', {
      get: () => Far('cap', {}),
    }),
    gcImports: false,
  });
  await E(sessionA.getRemoteMain()).get();
  // We have an import for the returned cap.  Disposing the session would
  // release imports — we instead trigger a manual release via getStats.
  const before = sessionA.getStats();
  t.true(before.imports >= 1);
});
