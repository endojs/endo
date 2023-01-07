# Endo Streams

Endo models streams as hardened async iterators.
Async iterators are sufficient to model back-pressure or pacing
since they are channel messages both from producer to consumer
and consumer to producer.
Streams are therefore symmetric.
The same stream type serves for both a reader and a writer.

These streams depend on full Endo environment initialization, as with `@endo/init`
to ensure that they are run in Hardened JavaScript with remote promise support
(eventual send).

## Writing

To write to a stream, give a value to the next method.

```js
// ...
await writer.next(value);
```

Awaiting the returned promise slows the writer to match the pace of the reader.

## Reading

To read from a stream, await the value returned by the next method.

```js
for await (const value of reader) {
  // ...
}
```

## Map

To map a reader to a reader through a synchronous value transform, use `mapReader`.

```js
const doubleReader = mapReader(singleReader, n => n * 2);
```

In this example, any value read from doubleReader will be double what was read
from singleReader.

To map a writer to a writer through a synchronous value transform, use
`mapWriter`.

```js
const singleWriter = mapWriter(doubleWriter, n => n * 2);
```

In this example, any value written to singleWriter will be writ double to
doubleWriter.

## Pipe

The `makePipe` function returns an entangled pair of streams.
Use one as a reader and the other as a writer.
Pipes are useful for mocking streams in tests.

```js
const [writer, reader] = makePipe();
```

Pipes use `makeStream` and `makeQueue`.
`makeQueue` creates an async promise queue: a collection type like a queue
except that `get` returns a promise and `put` accepts a promise, so `get` can
be called before `put`.
An async queue ensures that the promises returned by `get` and accepted by
`put` are matched respectively, but provides no guarantee about the order in
which promises settle.
A stream is consequently a pair of queues that transport iteration results,
one to send messages forward and another to receive acknowledgements.

An async queue is itself an input and output pair.
The `put` function makes it an async sink, and the `get` function makes it an
async spring.

## Topic

The `makeTopic` function returns a kit with a `publisher` and a `subscribe`
function.
The `publisher` is a writer, but provides no back-pressure.
The `subscribe` function returns readers.

```js
const { publisher, subscribe } = makeTopic();
const subscriber = subscribe();
publisher.next(value);
for (const value of subscriber) {}
```

Topics are very similar to pipes, but instead of using `makeQueue`,
topics use a very similar `makePubSub()`, which produces one sink and any
number of springs encapsulating a shared async linked list.
The topic writer is a stream constructed from the sink and a null spring.
The null spring provides no forward-pressure.
The topic readers are streams constructed from a null sink (so no
back-pressure) and a subscriber spring that serves as an independent
cursor starting with the next published value.

## Pump

The `pump` function pumps iterations from a reader to a writer.
The pump must be primed with the first acknowledgement to send to the reader,
typically `undefined`, as in `reader.next(undefined)`.
This makes the parity of a pump "odd", because the reader needs a free
acknowledgement to start.
This is in contrast to a pipe, which has "even" parity, because the reader and
writer can both proceed initially.

So, for example, we can implement `cat` in Node.js by pumping stdin to stdout.

```js
import { makeNodeWriter, makeNodeReader } from '@endo/stream-node';

const writer = makeNodeWriter(process.stdout);
const reader = makeNodeReader(process.stdin);
await pump(writer, reader);
```

## Prime

Async generator functions are very useful for making reader adapters.

```js
async function *double(reader) {
  for await (const value of reader) {
    yield value * 2;
  }
  return undefined;
}
```

However, async generator functions can also serve as writers, because `yield`
evaluates to the argument passed to `next`.
However, generator writers have odd parity, meaning the first value sent to a
generator function has nowhere to go and gets discarded as the program counter
proceeds from the beginning of the function to the first `yield`, `return`, or
`throw`.

The `prime` function compensates for this by sending a primer to the generator
once.

```js
async function *logGenerator() {
  for (;;) {
    console.log(yield);
  }
}

const writer = prime(logGenerator());
await writer.next('First message is not discarded');
```

## Hardening

This library depends on Hardened JavaScript.
The environment must be locked down before initializing this library.
All of the exported functions and the streams they produce are hardened.

This implementation of streams ensures that iteration results are shallowly
frozen.
The user is responsible for hardening the transported values if that is their
intent.
Some values like array buffers cannot be frozen.
