# `@endo/pubsub`

Local-layer pubsub topics over a shared async promise linked list.

`@endo/pubsub` ships two topic variants:

- `makeChangeTopic` builds a **lossless deltas** topic.
  Every value published after a subscriber begins iterating reaches that
  subscriber.
  Slow subscribers accumulate undrained nodes in their own cursor closure
  rather than in the producer's state.
- `makeLatestTopic` builds a **lossy** topic.
  A slow subscriber observes only the most recent value the producer has
  published; intermediate values are overwritten.

Both factories return `{ publisher, subscribe }` where the publisher is a
local `Writer<TValue, TReturn>` from
[`@endo/stream`](../stream/README.md) and `subscribe()` returns an independent
local `Reader<TValue, TReturn>`.
Publishers and subscribers compose with `pump`, `makePipe`, and `prime` from
`@endo/stream` at the local layer.

`@endo/pubsub` is a sibling of `@endo/exo-stream` at the local layer; the
exo-layer counterpart `@endo/exo-pubsub` (proposed in the
`notifier-pubsub-migration` design on the `llm` roadmap branch) lifts the
same topology onto CapTP-passable exo refs.

## Sink and Spring

A pubsub topic decomposes into a publisher-side **sink** and a per-subscriber
**spring** over a single async promise linked list.
The sink extends the linked list one node at a time as the publisher emits
values.
Each spring is an independent cursor over the same list; when a spring is
created, its cursor starts at the next node the publisher will add.

```js
import { makePubSub } from '@endo/pubsub/pub-sub.js';

const { pub, sub } = makePubSub();
const a = sub();
pub.put(1);
const b = sub();
pub.put(2);
await a.get(); // 1
await a.get(); // 2
await b.get(); // 2
```

## Lossless deltas

`makeChangeTopic` exposes the sink as a `Writer<TValue, TReturn>` and each
spring as a `Reader<TValue, TReturn>`.

```js
import { makeChangeTopic } from '@endo/pubsub/change-topic.js';

const { publisher, subscribe } = makeChangeTopic();
const early = subscribe();
await publisher.next(1);
await publisher.next(2);
const late = subscribe();
await publisher.next(3);

await early.next(); // { value: 1, done: false }
await early.next(); // { value: 2, done: false }
await early.next(); // { value: 3, done: false }

await late.next(); // { value: 3, done: false }
```

The producer is not blocked by any subscriber's drain rate.
A slow subscriber accumulates undrained nodes in its own cursor closure;
the producer advances the shared linked list past every published value.

## Lossy updates

`makeLatestTopic` shares the publisher and subscriber shapes with
`makeChangeTopic` but retains only the most-recent value.
A slow subscriber that misses several publishes sees only the latest when it
next drains.

```js
import { makeLatestTopic } from '@endo/pubsub/latest-topic.js';

const { publisher, subscribe } = makeLatestTopic();
const a = subscribe();
await publisher.next(1);
await publisher.next(2);
await publisher.next(3);

await a.next(); // { value: 3, done: false }
```

A subscriber created after at least one value has been published sees the
most recent value on its first `next()` call (replay-on-iterate).
A subscriber created before any value has been published blocks on its first
`next()` until the publisher emits.

## Termination

For both topic variants, `publisher.return(value)` settles every subscriber
with `{ value, done: true }` on the next `next()`, and every subsequent call
keeps returning the same terminal result.
`publisher.throw(error)` settles every subscriber by rejecting with the error
on the next `next()`; subsequent calls reject with the same error.

A subscriber created after the topic has terminated immediately sees the
terminal disposition on its first `next()` call without blocking.

## Cancellation

`@endo/pubsub` does not ship its own cancellation primitive.
Pair it with [`@endo/cancel`](../cancel/README.md)'s `makeCancelKit` to
terminate a consumer-driven iteration without disturbing the topic itself or
peer subscribers.

```js
import { makeCancelKit } from '@endo/cancel';

const { cancel, cancelled } = makeCancelKit();
// ... later
cancel(Error('done'));
// `cancelled` rejects with that error.
```

Subscribers can race their own `next()` against `cancelled` to break out of
a `for await` loop that should stop on a local signal.

## Layering

`@endo/pubsub` is the local-only layer.
Producers and subscribers are async-iterator-shaped JavaScript objects; they
are not passable over CapTP.
For the CapTP-passable counterpart, see `@endo/exo-pubsub` (proposed in the
companion `notifier-pubsub-migration` design), which lifts a local topic to a
topic exo via a `from-iterator`-style factory in the same way
`@endo/exo-stream`'s `PassableReader` / `PassableWriter` lift `@endo/stream`'s
local `Reader<T>` / `Writer<T>`.
