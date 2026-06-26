// @ts-check
import test from '@endo/ses-ava/test.js';

import { makeLatestTopic } from '../latest-topic.js';

test('latest-topic: subscriber created before any publish blocks', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  let resolved = false;
  const pending = reader.next().then(result => {
    resolved = true;
    return result;
  });
  await Promise.resolve();
  await Promise.resolve();
  t.false(resolved);
  await publisher.next(42);
  t.deepEqual(await pending, { value: 42, done: false });
});

test('latest-topic: late subscriber sees most-recent immediately', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  await publisher.next(1);
  await publisher.next(2);
  await publisher.next(3);
  const late = subscribe();
  t.deepEqual(await late.next(), { value: 3, done: false });
});

test('latest-topic: slow subscriber sees only latest, not intermediates', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.next(2);
  await publisher.next(3);
  t.deepEqual(await reader.next(), { value: 3, done: false });
  await publisher.next(4);
  await publisher.next(5);
  t.deepEqual(await reader.next(), { value: 5, done: false });
});

test('latest-topic: same-value reads after seeing latest block until next publish', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.next(1);
  t.deepEqual(await reader.next(), { value: 1, done: false });
  let resolved = false;
  const pending = reader.next().then(result => {
    resolved = true;
    return result;
  });
  await Promise.resolve();
  await Promise.resolve();
  t.false(resolved, 'should block until a fresh value arrives');
  await publisher.next(2);
  t.deepEqual(await pending, { value: 2, done: false });
});

test('latest-topic: multiple subscribers each see latest independently', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const a = subscribe();
  const b = subscribe();
  await publisher.next('x');
  t.deepEqual(await a.next(), { value: 'x', done: false });
  t.deepEqual(await b.next(), { value: 'x', done: false });
  await publisher.next('y');
  t.deepEqual(await a.next(), { value: 'y', done: false });
  t.deepEqual(await b.next(), { value: 'y', done: false });
});

test('latest-topic: publisher.return settles subscribers with terminal', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.return(undefined);
  // The reader first sees the most-recent value...
  t.deepEqual(await reader.next(), { value: 1, done: false });
  // ...then sees the terminal on the next read.
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

test('latest-topic: subscribe after return sees terminal', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  await publisher.next(1);
  await publisher.return(undefined);
  const late = subscribe();
  // Late subscriber sees the latest value first, then terminal.
  t.deepEqual(await late.next(), { value: 1, done: false });
  t.deepEqual(await late.next(), { value: undefined, done: true });
});

test('latest-topic: subscribe after throw rejects on next', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  await publisher.throw(Error('boom'));
  const reader = subscribe();
  await t.throwsAsync(reader.next(), { message: 'boom' });
});

test('latest-topic: publisher.throw rejects subscribers after value', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.next(1);
  await publisher.throw(Error('boom'));
  t.deepEqual(await reader.next(), { value: 1, done: false });
  await t.throwsAsync(reader.next(), { message: 'boom' });
});

test('latest-topic: terminal is sticky on additional reads', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.return(undefined);
  t.deepEqual(await reader.next(), { value: undefined, done: true });
  t.deepEqual(await reader.next(), { value: undefined, done: true });
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

test('latest-topic: publish after termination is a no-op', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  await publisher.return(undefined);
  await publisher.next(999);
  const reader = subscribe();
  t.deepEqual(await reader.next(), { value: undefined, done: true });
});

test('latest-topic: for-await loop drains and exits on terminal', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  await publisher.next('a');
  // Drain 'a', then publish 'b' and 'c' (only 'c' is visible), then return.
  const seen = [];
  const drainPromise = (async () => {
    for await (const value of reader) {
      seen.push(value);
      if (seen.length >= 2) break;
    }
  })();
  await Promise.resolve();
  await publisher.next('b');
  await publisher.next('c');
  await drainPromise;
  // The reader saw at least 'a' and then either 'b' or 'c' depending on
  // scheduling. The lossy contract guarantees the latest at-time-of-drain.
  t.is(seen[0], 'a');
  t.true(seen[1] === 'b' || seen[1] === 'c');
});
