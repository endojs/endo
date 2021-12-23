# Endo Streams

Endo models streams as hardened async iterators.
Async iterators are sufficient to model back-pressure or pacing
since they are channel messages both from producer to consumer
and consumer to producer.
Streams are therefore symmetric.
The same stream type serves for both a reader and a writer.

## Writing

To write to a stream, give a value to the next method.

```js
// ...
await writer.next(value);
```

Awaiting the returned promise slows the writer to match the pace of the reader.

## Reading

To read from a string, await the value returned by the next method.

```js
for await (const value of reader) {
  // ...
}
```

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

## Hardening

This library depends on Hardened JavaScript.
The environment must be locked down before initializing this library.
All of the exported functions and the streams they produce are hardened.

This implementation of streams ensures that iteration results are shallowly
frozen.
The user is responsible for hardening the transported values if that is their
intent.
Some values like array buffers cannot be frozen.
