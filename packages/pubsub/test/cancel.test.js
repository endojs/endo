// @ts-check
import test from '@endo/ses-ava/test.js';

import { makeCancelKit } from '@endo/cancel';

import { makeChangeTopic } from '../change-topic.js';
import { makeLatestTopic } from '../latest-topic.js';

// `@endo/pubsub` ships no cancellation primitive of its own; a consumer pairs a
// subscriber with `@endo/cancel`'s `makeCancelKit` to abandon a read on a local
// signal without disturbing the topic or its peer subscribers (README §
// Cancellation). These tests exercise that documented pairing so the
// integration stays honest as either package evolves.

test('cancellation: cancelled unblocks a pending read without disturbing the topic', async t => {
  t.timeout(5000);
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  const { cancel, cancelled, isCancelled } = makeCancelKit();

  t.false(isCancelled());

  // A consumer blocked on next() — nothing published yet, so the read never
  // settles — races it against its local cancellation token. The cancelled
  // token wins and surfaces the cancellation reason.
  const raced = Promise.race([
    reader.next(),
    cancelled.then(
      () => undefined,
      reason => reason,
    ),
  ]);

  cancel(Error('consumer lost interest'));
  const outcome = await raced;

  t.true(outcome instanceof Error);
  t.is(/** @type {Error} */ (outcome).message, 'consumer lost interest');
  t.true(isCancelled());

  // The topic is undisturbed: the publisher still advances and a fresh
  // subscriber observes subsequent values.
  await publisher.next(1);
  const peer = subscribe();
  await publisher.next(2);
  t.deepEqual(await peer.next(), { value: 2, done: false });
});

test('cancellation: a for-await loop stops on the local signal', async t => {
  t.timeout(5000);
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();
  const { cancel, cancelled } = makeCancelKit();

  await publisher.next('a');
  await publisher.next('b');

  // Drain the topic but break out when the local cancellation token rejects,
  // leaving the topic open for peers.
  const seen = [];
  const stop = cancelled.then(
    () => ({ value: undefined, done: true }),
    () => ({ value: undefined, done: true }),
  );
  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const result = await Promise.race([reader.next(), stop]);
    if (result.done) break;
    seen.push(result.value);
    if (seen.length === 2) {
      cancel(Error('seen enough'));
    }
  }
  t.deepEqual(seen, ['a', 'b']);

  // The producer is untouched by the consumer-side cancellation.
  await publisher.next('c');
  const peer = subscribe();
  await publisher.next('d');
  t.deepEqual(await peer.next(), { value: 'd', done: false });
});

test('cancellation: isCancelled lets a consumer skip a read synchronously', async t => {
  const { publisher, subscribe } = makeLatestTopic();
  const reader = subscribe();
  const { cancel, isCancelled } = makeCancelKit();

  await publisher.next('a');
  t.false(isCancelled());
  t.deepEqual(await reader.next(), { value: 'a', done: false });

  cancel(Error('stop'));
  // A cooperative consumer observes cancellation synchronously and abandons
  // the loop without consulting the topic again.
  t.true(isCancelled());
});
