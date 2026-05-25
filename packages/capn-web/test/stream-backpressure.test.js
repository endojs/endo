// @ts-nocheck
/* global setTimeout */
// Stream backpressure tests for the WHATWG-Streams ⇄ Cap'n Web bridge.
//
// The bridge serialises one chunk per remote call, so backpressure
// emerges naturally: each `await E(stub).write(chunk)` waits for the
// peer's underlying-sink Promise to resolve before the next write
// proceeds.  These tests pin that invariant.

import test from '@endo/ses-ava/test.js';
import { Far } from '@endo/pass-style';
import { E } from '@endo/eventual-send';

import { makeCapnWebSession, makeLoopbackPair } from '../src/index.js';

const makePair = bMain => {
  const { a, b } = makeLoopbackPair();
  const sessionA = makeCapnWebSession(a, { gcImports: false });
  makeCapnWebSession(b, { localMain: bMain, gcImports: false });
  return sessionA.getRemoteMain();
};

test('writes serialise: each await write resolves only after server processes it', async t => {
  const events = [];
  const writable = Far('writable', {
    write: async chunk => {
      events.push(['recv', chunk]);
      // Simulate slow consumer.
      await new Promise(r => setTimeout(r, 20));
      events.push(['done', chunk]);
    },
    close: () => {},
  });
  const r = makePair(writable);

  // Sender writes 3 chunks, awaiting each.  Per-write events on the
  // server should fully bracket each other before the next write begins.
  await E(r).write('a');
  await E(r).write('b');
  await E(r).write('c');

  t.deepEqual(events, [
    ['recv', 'a'],
    ['done', 'a'],
    ['recv', 'b'],
    ['done', 'b'],
    ['recv', 'c'],
    ['done', 'c'],
  ]);
});

test('un-awaited writes still arrive at receiver in send order', async t => {
  // If the user fire-and-forgets `E(stub).write(chunk)` without awaiting,
  // the chunks reach the receiver's handler in send order — we record the
  // arrival timing at handler entry (before any awaited work) to verify
  // the wire ordering itself, since handler completion order can race.
  const arrivals = [];
  const writable = Far('writable', {
    write: chunk => {
      arrivals.push(chunk);
    },
  });
  const r = makePair(writable);

  const ps = [];
  for (let i = 0; i < 5; i += 1) ps.push(E(r).write(i));
  await Promise.all(ps);

  t.deepEqual(arrivals, [0, 1, 2, 3, 4]);
});

test('writer abort with reason propagates through the bridge', async t => {
  let abortReason;
  const writable = Far('writable', {
    write: async () => {},
    abort: async reason => {
      abortReason = reason;
    },
  });
  const r = makePair(writable);

  await E(r).write('first');
  await E(r).abort(new Error('cancelled'));
  t.true(abortReason instanceof Error);
  t.is(abortReason.message, 'cancelled');
});

test('write rejection propagates back to the sender', async t => {
  const writable = Far('writable', {
    write: async chunk => {
      if (chunk === 'bad') throw new TypeError('refused');
    },
  });
  const r = makePair(writable);

  await E(r).write('ok'); // succeeds
  let caught;
  try {
    await E(r).write('bad');
  } catch (e) {
    caught = e;
  }
  t.true(caught instanceof TypeError);
  t.is(caught.message, 'refused');

  // Subsequent writes still work — rejections don't tear down the link.
  const result = await E(r).write('after');
  t.is(result, undefined);
});

test('close after writes signals end-of-stream', async t => {
  let closed = false;
  const events = [];
  const writable = Far('writable', {
    write: async chunk => {
      events.push(chunk);
    },
    close: async () => {
      closed = true;
    },
  });
  const r = makePair(writable);

  await E(r).write('one');
  await E(r).write('two');
  await E(r).close();

  t.deepEqual(events, ['one', 'two']);
  t.true(closed);
});
