// @ts-check
/* eslint-disable no-await-in-loop */
import test from '@endo/ses-ava/prepare-endo.js';
import { M } from '@endo/patterns';
import { makePromiseKit } from '@endo/promise-kit';

import { makeBufferedReader } from '../buffered-channel.js';
import { iterateReader } from '../iterate-reader.js';

/** @import { StreamNode } from '../types.js' */

const events = harden([
  { type: 'delta', text: 'hel' },
  { type: 'delta', text: 'lo' },
  { type: 'final', text: 'hello' },
]);

// Semantic 1: fire-and-forget push — the producer runs ahead of any consumer.
// Semantic 2: a terminal event is delivered in-band, then the stream is done.
test('legacy surface: producer runs ahead; terminal event auto-finalizes', async t => {
  await null;
  const { push, reader, isClosed } = makeBufferedReader();

  for (const event of events) {
    push(event);
  }
  push({ type: 'end' });
  t.true(isClosed());
  // Pushes after the terminal are ignored.
  push({ type: 'delta', text: 'late' });

  for (const event of events) {
    t.deepEqual(await reader.next(), { value: event, done: false });
  }
  t.deepEqual(await reader.next(), { value: { type: 'end' }, done: false });
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

// Semantics 3 + 4 on the legacy surface: return() reports done promptly,
// discards buffered events, and fires onClose.
test('legacy surface: return() discards buffer and fires onClose', async t => {
  await null;
  let closed = 0;
  const { push, reader, isClosed } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });

  push(events[0]);
  push(events[1]);
  t.deepEqual(await reader.next(), { value: events[0], done: false });

  t.deepEqual(await reader.return(), { value: undefined, done: true });
  t.is(closed, 1);
  t.true(isClosed());
  // The undelivered event was discarded, not drained.
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

test('legacy surface: onClose does not fire after a natural finish', async t => {
  await null;
  let closed = 0;
  const { push, reader } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });
  push({ type: 'end' });
  t.deepEqual(await reader.return(), { value: undefined, done: true });
  t.is(closed, 0);
});

test('legacy surface: throw() finalizes, fires a late-set onClose, and rejects', async t => {
  let closed = 0;
  const { reader, setOnClose } = makeBufferedReader();
  setOnClose(() => {
    closed += 1;
  });
  await t.throwsAsync(() => reader.throw(Error('consumer failed')), {
    message: /consumer failed/,
  });
  t.is(closed, 1);
});

test('iterateReader round-trip delivers events and the in-band terminal', async t => {
  await null;
  for (const buffer of [0, 4]) {
    const { push, reader } = makeBufferedReader();
    for (const event of events) {
      push(event);
    }
    push({ type: 'end' });

    const results = [];
    for await (const event of iterateReader(reader, { buffer })) {
      results.push(event);
    }
    t.deepEqual(results, [...events, { type: 'end' }]);
  }
});

// Semantic 1 at the wire level: acknowledge nodes resolve eagerly with no
// synchronize credit spent.
test('acks resolve eagerly without synchronize credit', async t => {
  await null;
  const { push, reader } = makeBufferedReader();

  // A synchronize chain that never grants credit and never closes.
  /** @type {import('@endo/promise-kit').PromiseKit<StreamNode<undefined, undefined>>} */
  const { promise: synHead } = makePromiseKit();
  let nodePromise = reader.stream(synHead);

  for (const event of events) {
    push(event);
  }

  for (const event of events) {
    const node = await nodePromise;
    t.deepEqual(node.value, event);
    t.not(node.promise, null);
    nodePromise = /** @type {Promise<StreamNode>} */ (node.promise);
  }
});

// Semantic 3: close is observed promptly even while the producer is idle —
// the case that rules out a pull-pump composition.
test('return() while the producer is idle fires onClose promptly', async t => {
  await null;
  const closeKit = makePromiseKit();
  const { push, reader } = makeBufferedReader({
    onClose: () => closeKit.resolve(undefined),
  });

  const iterator = iterateReader(reader);
  push(events[0]);
  t.deepEqual(await iterator.next(), { done: false, value: events[0] });

  // Producer idle: nothing pushed, nothing in flight.
  const result = await iterator.return();
  t.true(result.done);
  await closeKit.promise;
  t.pass('onClose fired with no pending push');
});

// Semantic 4 at the wire level: pushed-but-unconsumed events never reach the
// consumer after return().
test('return() discards buffered events on the protocol surface', async t => {
  await null;
  let closed = 0;
  const { push, reader, isClosed } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });

  const iterator = iterateReader(reader);
  for (const event of events) {
    push(event);
  }
  t.deepEqual(await iterator.next(), { done: false, value: events[0] });

  const result = await iterator.return();
  t.true(result.done);
  t.is(closed, 1);
  t.true(isClosed());
  // Later pushes are ignored and the iterator stays done.
  push({ type: 'delta', text: 'late' });
  t.deepEqual(await iterator.next(), result);
});

test('readPattern validates events at push time', async t => {
  const { push } = makeBufferedReader({
    readPattern: M.splitRecord({ type: M.string() }),
  });
  t.notThrows(() => push({ type: 'delta', text: 'ok' }));
  t.throws(() => push({ text: 'no type' }), {
    message: /type/,
  });
});

test('a terminal abort event finalizes without firing onClose', async t => {
  await null;
  let closed = 0;
  const { push, reader, isClosed } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });
  push({ type: 'abort', reason: 'producer failed' });
  push({ type: 'delta', text: 'ignored after terminal' });
  t.true(isClosed());

  const results = [];
  for await (const event of iterateReader(reader)) {
    results.push(event);
  }
  t.deepEqual(results, [{ type: 'abort', reason: 'producer failed' }]);
  t.is(closed, 0, 'a producer-side terminal is not a consumer close');
});

// Regression: a consumer that drains to natural completion never calls
// return(), so nothing terminates the synchronize chain. The close watcher
// must still retire, or it parks forever holding this channel's state.
test('draining to completion releases the close watcher', async t => {
  t.timeout(10_000);
  const { push, reader } = makeBufferedReader();
  push(events[0]);
  push({ type: 'end' });

  const results = [];
  for await (const event of iterateReader(reader)) {
    results.push(event);
  }
  t.is(results.length, 2);

  // The watcher retired with the pump: a syn chain extended afterwards is
  // never walked, so no close is observed and onClose cannot fire late.
  let lateClose = 0;
  const { push: push2, reader: reader2 } = makeBufferedReader({
    onClose: () => {
      lateClose += 1;
    },
  });
  push2({ type: 'end' });
  const iterator = iterateReader(reader2);
  t.true((await iterator.next()).done === false);
  t.true((await iterator.next()).done);
  await iterator.return();
  t.is(lateClose, 0, 'a naturally finished stream reports no consumer close');
});

test('legacy next() is refused once a protocol consumer has attached', async t => {
  await null;
  const { push, reader } = makeBufferedReader();
  push(events[0]);
  const iterator = iterateReader(reader);
  t.deepEqual(await iterator.next(), { done: false, value: events[0] });

  await t.throwsAsync(() => reader.next(), {
    message: /next\(\) is unavailable after stream\(\)/,
  });
  // return() stays available: interrupt()/terminate() close readers that way.
  t.true((await reader.return()).done);
});

test('legacy throw() accepts a non-Error reason and still fires onClose', async t => {
  let closed = 0;
  const { reader } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });
  // AVA's throwsAsync insists on an Error; this reason deliberately is not one
  // (the point is that the guard no longer rejects non-Error reasons).
  /** @type {unknown} */
  let rejection;
  await reader.throw('user cancelled').catch(reason => {
    rejection = reason;
  });
  t.is(rejection, 'user cancelled');
  t.is(closed, 1, 'the close intent is not dropped by the interface guard');
});

test('a self-referential synchronize node finalizes instead of spinning', async t => {
  t.timeout(10_000);
  let closed = 0;
  const { reader } = makeBufferedReader({
    onClose: () => {
      closed += 1;
    },
  });
  /** @type {any} */
  let cyclic;
  const selfPromise = Promise.resolve().then(() => cyclic);
  cyclic = harden({ value: undefined, promise: selfPromise });
  reader.stream(selfPromise);

  for (let i = 0; i < 10 && closed === 0; i += 1) {
    await new Promise(resolve => {
      resolve(undefined);
    });
  }
  t.is(closed, 1, 'a chain that cannot advance is treated as a close');
});

test('the kit is hardened', async t => {
  const kit = makeBufferedReader();
  t.true(Object.isFrozen(kit));
});

test('stream() may be called at most once', async t => {
  const { reader } = makeBufferedReader();
  const { promise: synHead } = makePromiseKit();
  reader.stream(synHead);
  const { promise: synHead2 } = makePromiseKit();
  t.throws(() => reader.stream(synHead2), {
    message: /at most once/,
  });
});
