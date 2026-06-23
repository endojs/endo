// @ts-check
/// <reference types="ses"/>

/** @import { AsyncSink, AsyncSpring } from '@endo/stream' */

import harden from '@endo/harden';

/**
 * A `Sink` that discards every value put to it.
 *
 * Used as the back-pressure half of a pubsub topic's reader-side stream:
 * a topic subscriber acknowledges receipt by putting an iteration result into
 * its acknowledgement sink, but the producer side is not waiting for the ack,
 * so the acks are discarded.
 *
 * The unknown sink type lets a subscriber-side `makeStream` pair a typed
 * spring with this untyped sink without type erasure on the spring side.
 *
 * @type {AsyncSink<unknown>}
 */
export const nullSink = harden({
  put: _value => {},
});

/**
 * A `Spring` whose `get()` resolves to `undefined` immediately.
 *
 * Used as the data half of a pubsub topic's writer-side stream:
 * the producer's `next(value)` call awaits a forward-pressure spring after
 * publishing, but the topic does not block the producer on subscriber drain
 * rate, so the spring resolves immediately.
 *
 * @type {AsyncSpring<undefined>}
 */
export const nullSpring = harden({
  /** @returns {Promise<undefined>} */
  get: async () => undefined,
});
