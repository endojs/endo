// @ts-check
import test from '@endo/ses-ava/test.js';

import { makeCancelKit } from '../cancel-kit.js';
import { makeChangeTopic } from '../change-topic.js';

test('cancel-kit: cancel rejects the cancelled promise', async t => {
  const { cancel, cancelled } = makeCancelKit();
  cancel(Error('done'));
  await t.throwsAsync(cancelled, { message: 'done' });
});

test('cancel-kit: subsequent cancels are no-ops', async t => {
  const { cancel, cancelled } = makeCancelKit();
  cancel(Error('first'));
  cancel(Error('second')); // No-op; the cancelled promise has already settled.
  await t.throwsAsync(cancelled, { message: 'first' });
});

test('cancel-kit: cancel without explicit reason produces a default error', async t => {
  const { cancel, cancelled } = makeCancelKit();
  cancel();
  await t.throwsAsync(cancelled, { message: 'Cancelled' });
});

test('cancel-kit: race against cancelled breaks consumer loop', async t => {
  const { cancel, cancelled } = makeCancelKit();
  const { publisher, subscribe } = makeChangeTopic();
  const reader = subscribe();

  /** @type {Promise<IteratorResult<unknown, undefined>>} */
  const cancellationSentinel = cancelled.then(
    () => /** @type {IteratorResult<unknown, undefined>} */ ({
      value: undefined,
      done: true,
    }),
    () => /** @type {IteratorResult<unknown, undefined>} */ ({
      value: undefined,
      done: true,
    }),
  );

  // Publish two values, then drain them synchronously through the reader to
  // populate `seen` deterministically, then cancel and confirm the loop exits
  // on cancellation.
  await publisher.next(1);
  await publisher.next(2);

  /** @type {unknown[]} */
  const seen = [];
  const r1 = await Promise.race([reader.next(), cancellationSentinel]);
  if (!r1.done) seen.push(r1.value);
  const r2 = await Promise.race([reader.next(), cancellationSentinel]);
  if (!r2.done) seen.push(r2.value);

  // Now cancel and verify the next race yields the sentinel.
  cancel(Error('done'));
  const r3 = await Promise.race([reader.next(), cancellationSentinel]);
  t.true(r3.done, 'reader.next race after cancel yields the done sentinel');
  t.deepEqual(seen, [1, 2]);
});
