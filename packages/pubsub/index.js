// @ts-check
/// <reference types="ses"/>

/**
 * `@endo/pubsub` is the local-layer pubsub primitive: a producer is a local
 * `Writer<T>` from `@endo/stream`, and each subscriber is a local
 * `Reader<T>`.
 *
 * Two topic variants ship in this iteration:
 *
 * - `makeChangeTopic` produces a **lossless deltas** topic over a shared
 *   async promise linked list (the Sink + Spring convention).
 *   Every value published after a subscriber begins iterating reaches that
 *   subscriber; subscribers that lag accumulate undrained nodes in their
 *   own cursor closure rather than in the producer's state.
 * - `makeLatestTopic` produces a **lossy** topic with a single mutable
 *   latest-cell.
 *   A slow subscriber observes only the most recent value the producer has
 *   published; intermediate values are overwritten.
 *
 * Both topic factories return `{ publisher, subscribe }` where the publisher
 * is a `Writer<TValue, TReturn>` and `subscribe()` returns an independent
 * `Reader<TValue, TReturn>`.
 *
 * `makeCancelKit` is a small cancellation primitive (`{ cancel, cancelled }`)
 * used to terminate consumer-driven iteration without disturbing the topic
 * itself or peer subscribers.
 */

export { makeChangeTopic } from './change-topic.js';
export { makeLatestTopic } from './latest-topic.js';
export { makePubSub } from './pub-sub.js';
export { makeCancelKit } from './cancel-kit.js';
export { nullSink, nullSpring } from './null-queue.js';
