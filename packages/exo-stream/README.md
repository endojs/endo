# @endo/exo-stream

CapTP abstraction for bridging async iterator streams.

## Overview

This package provides utilities for bridging async iterator protocol over CapTP.
We introduce an [Exo Stream Protocol](PROTOCOL.md), which uses asynchronous
promise chains to pipeline iterations forward and backward between the
initiator (typically a consumer) and responder (typically a producer).
Like async iterator protocol, the Exo Stream Protocol is symmetric and
can be used either for readers or writers, and the full expressive gammut of
JavaScript generators.

Additionally, because round-trip-time is a concern, the producer and consumer
can pre-ack a number of messages, allowing the producer to prepare and transmit
iterations in advance of the consumer's need.

Because Exo Streams operate at the Exo layer, they support pattern guards
for all passable values.
Producers and consumers can rely on all values to match the desired shape,
or the stream will break with an error.

Owing to temporary limitations of CapTP, we provide a specialized byte stream
utilities that haul base64 encoded data.
We expect this facility to become unnecessary when CapTP supports passable byte
arrays.

## Installation

```sh
yarn add @endo/exo-stream
```

## Usage

This package does not use barrel exports.
Import each function from its own module:

### Passable Streams

For streaming arbitrary passable values:

```js
import { streamIterator } from '@endo/exo-stream/stream-iterator.js';
import { iterateStream } from '@endo/exo-stream/iterate-stream.js';

// Responder: Convert local iterator to remote stream reference
async function* localData() {
  yield { type: 'message', text: 'hello' };
  yield { type: 'data', value: 42 };
}
const streamRef = streamIterator(localData());
// streamRef can now be passed over CapTP

// Initiator: Convert remote stream reference back to local iterator
const reader = iterateStream(streamRef);
for await (const value of reader) {
  // value is the passable object
  console.log(value);
}
```

### Options

Both `iterateStream` and `iterateBytesStream` accept options:

```js
// Buffer: pre-synchronize N values to reduce round-trips (default is 1)
const reader = iterateStream(streamRef, { buffer: 3 });

// Pattern validation for read and read-return values
import { M } from '@endo/patterns';
const reader = iterateStream(streamRef, {
  readPattern: M.splitRecord({ type: M.string(), count: M.number() }),
  readReturnPattern: M.undefined(),
});
```

### Bytes Streams

Stream passable binary messages, async iteration of `Uint8Array`.
These byte streams are not a ring buffer, so they preserve the framing of
individual messages.
Bytes from one message never move into a neighbor and messages are never
divided.

```js
import { streamBytesIterator } from '@endo/exo-stream/stream-bytes-iterator.js';
import { iterateBytesStream } from '@endo/exo-stream/iterate-bytes-stream.js';

// Responder: Convert local iterator to remote stream reference
async function* localBytes() {
  yield new Uint8Array([1, 2, 3]);
  yield new Uint8Array([4, 5, 6]);
}
const bytesStreamRef = streamBytesIterator(localBytes());
// bytesStreamRef can now be passed over CapTP

// Initiator: Convert remote stream reference back to local iterator
const reader = await iterateBytesStream(bytesStreamRef);
for await (const message of reader) {
  // message is Uint8Array
  console.log(message);
}
```

## API

### `streamIterator<TRead, TWrite, TReadReturn, TWriteReturn>(iterator, options?)`

Convert a local `AsyncIterator<Passable>` to a remote `PassableStream` reference.
Mirrors the template parameters of `Stream<TRead, TWrite, TReadReturn, TWriteReturn>`.

**Options:**
- `buffer` (number, default 0): Number of values to pre-pull before waiting for synchronizes. With 0, waits for sync before each pull (fully synchronized).
- `readPattern` (Pattern): Pattern describing TRead (yielded values)
- `readReturnPattern` (Pattern): Pattern describing TReadReturn (return value)
- `writePattern` (Pattern): Pattern describing TWrite (next() values)
- `writeReturnPattern` (Pattern): Pattern describing TWriteReturn (return() value)

### `iterateStream<TRead, TWrite, TReadReturn, TWriteReturn>(streamRef, options?)`

Convert a remote `PassableStream` reference to a local `Stream<TRead, TWrite, TReadReturn, TWriteReturn>`.
Mirrors the template parameters of `@endo/stream`'s `Stream`.

**Options:**
- `buffer` (number, default 1): Number of values to pre-synchronize
- `readPattern` (Pattern): Pattern to validate each TRead value
- `readReturnPattern` (Pattern): Pattern to validate TReadReturn

### `streamBytesIterator(bytesIterator, options?)`

Convert a local `AsyncIterator<Uint8Array>` to a remote `PassableBytesReader` reference.
Bytes are automatically base64-encoded for transmission over CapTP.

Uses `streamBase64()` method instead of `stream()` to allow future migration
to direct bytes transport when CapTP supports it.

The interface implies `Uint8Array` yields (no `readPattern` method).

**Options:**
- `buffer` (number, default 0): Number of values to pre-pull before waiting for synchronizes. With 0, waits for sync before each pull (fully synchronized).
- `readReturnPattern` (Pattern): Pattern describing TReadReturn (return value)

### `iterateBytesStream(bytesStreamRef, options?)`

Convert a remote `PassableBytesReader` reference to a local `AsyncIterableIterator<Uint8Array>`.
Base64 strings are automatically decoded to bytes.

Calls `streamBase64()` on the responder to allow future migration to direct
bytes transport.

The interface implies `Uint8Array` yields.

**Options:**
- `buffer` (number, default 1): Number of values to pre-synchronize
- `readReturnPattern` (Pattern): Pattern to validate TReadReturn

### Migration Path for Bytes Streams

Currently, bytes are transmitted as base64-encoded strings via `streamBase64()`.
When CapTP and pass-style support direct binary transport, bytes-streamable
Exos can implement the `stream()` method directly, allowing initiators to
gracefully transition to using `iterateStream()` instead of `iterateBytesStream()`.

## Design

See [DESIGN.md](./DESIGN.md) for design documentation.

## Protocol Specification

See [PROTOCOL.md](./PROTOCOL.md) for the formal protocol specification,
suitable for implementation in other languages or proposal to OCapN.

## Future Work

- Support direct binary transport when CapTP supports it.
- Add help methods to Exos for usage guidance.
- Propose protocol to OCapN working group.
