# @endo/exo-stream

CapTP abstraction for bridging async iterator streams.

## Overview

This package provides utilities for bridging async iterator protocol over CapTP.
We introduce an [Exo Stream Protocol](PROTOCOL.md), which uses asynchronous
promise chains to pipeline iterations forward and backward between the
initiator and responder.

A **reader** is a stream where data flows from responder to initiator.
A **writer** is a stream where data flows from initiator to responder.
In both cases, one chain carries data and the other carries flow control.
For Readers, when the initiator calls `return(value)` to close early, the final
synchronization node carries that argument value to the responder. If the
responder is backed by a JavaScript iterator with a `return(value)` method, the
responder forwards that argument and uses the iterator’s returned value as the
terminal acknowledgement. Otherwise, the responder terminates with the original
argument value. All other synchronization values are `undefined`.
For Writers, when the initiator closes early, the final synchronization node
likewise carries the argument value (which the responder may replace with its
own `return(value)` result if it implements `return`).

Additionally, because round-trip-time is a concern, the producer and consumer
can pre-ack a number of messages, allowing the producer to prepare and transmit
iterations in advance of the consumer's need.
The default buffer is 0 (fully synchronized); higher values are encouraged for
performance over high-latency links.

Because Exo Streams operate at the Exo layer, they support pattern guards
for all passable values.
Producers and consumers can rely on all values to match the desired shape,
or the stream will break with an error.

Owing to temporary limitations of CapTP, we provide specialized byte reader
and writer utilities that haul base64 encoded data.
We expect this facility to become unnecessary when CapTP supports passable byte
arrays.

## Installation

```sh
yarn add @endo/exo-stream
```

## Usage

This package does not use barrel exports.
Import each function from its own module:

### Readers

Stream arbitrary passable values from responder to initiator:

```js
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

// Responder: wrap a local iterator as a PassableReader
async function* localData() {
  yield { type: 'message', text: 'hello' };
  yield { type: 'data', value: 42 };
}
const readerRef = readerFromIterator(localData());
// readerRef can now be passed over CapTP

// Initiator: convert remote PassableReader to a local iterator
const reader = iterateReader(readerRef);
for await (const value of reader) {
  console.log(value);
}
```

### Writers

Stream arbitrary passable values from initiator to responder:

```js
import { writerFromIterator } from '@endo/exo-stream/writer-from-iterator.js';
import { iterateWriter } from '@endo/exo-stream/iterate-writer.js';
import { makePipe } from '@endo/stream';

// Responder: wrap a local sink as a PassableWriter
const [pipeReader, pipeWriter] = makePipe();
const writerRef = writerFromIterator(pipeWriter);
// writerRef can now be passed over CapTP

// Responder consumes received data locally
(async () => {
  for await (const value of pipeReader) {
    console.log(value);
  }
})();

// Initiator: push data to remote PassableWriter
const writer = iterateWriter(writerRef);
async function* localData() {
  yield { type: 'message', text: 'hello' };
  yield { type: 'data', value: 42 };
}
try {
  for await (const value of localData()) {
    await writer.next(value);
  }
} catch (err) {
  if (writer.throw) {
    await writer.throw(err);
  } else {
    await writer.return();
  }
  throw err;
} finally {
  await writer.return();
}
```

### Options

Reader and writer functions accept options:

```js
// Buffer: pre-synchronize N values to reduce round-trips (default is 0)
const reader = iterateReader(readerRef, { buffer: 3 });

// Pattern validation for read values
import { M } from '@endo/patterns';
const reader = iterateReader(readerRef, {
  readPattern: M.splitRecord({ type: M.string(), count: M.number() }),
  readReturnPattern: M.undefined(),
});
```

### Bytes Readers

Stream passable binary messages from responder to initiator, async iteration
of `Uint8Array`.
These byte streams are not a ring buffer, so they preserve the framing of
individual messages.
Bytes from one message never move into a neighbor and messages are never
divided.

```js
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

// Responder: wrap a local bytes iterator as a PassableBytesReader
async function* localBytes() {
  yield new Uint8Array([1, 2, 3]);
  yield new Uint8Array([4, 5, 6]);
}
const bytesReaderRef = bytesReaderFromIterator(localBytes());
// bytesReaderRef can now be passed over CapTP

// Initiator: convert remote PassableBytesReader to a local iterator
const reader = iterateBytesReader(bytesReaderRef);
for await (const message of reader) {
  // message is Uint8Array
  console.log(message);
}
```

### Bytes Writers

Stream passable binary messages from initiator to responder:

```js
import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
import { makePipe } from '@endo/stream';

// Responder: wrap a local sink as a PassableBytesWriter
const [pipeReader, pipeWriter] = makePipe();
const bytesWriterRef = bytesWriterFromIterator(pipeWriter);
// bytesWriterRef can now be passed over CapTP

// Responder consumes received bytes locally
(async () => {
  for await (const message of pipeReader) {
    // message is Uint8Array
    console.log(message);
  }
})();

// Initiator: push bytes to remote PassableBytesWriter
const bytesWriter = iterateBytesWriter(bytesWriterRef);
async function* localBytes() {
  yield new Uint8Array([1, 2, 3]);
  yield new Uint8Array([4, 5, 6]);
}
try {
  for await (const chunk of localBytes()) {
    await bytesWriter.next(chunk);
  }
} catch (err) {
  if (bytesWriter.throw) {
    await bytesWriter.throw(err);
  } else {
    await bytesWriter.return();
  }
  throw err;
} finally {
  await bytesWriter.return();
}
```

## API

### Reader Modules

#### `readerFromIterator(iterator, options?)`

Wrap a local `AsyncIterator<TRead>` as a `PassableReader` Exo
(responder side).

**Options:**
- `buffer` (number, default 0): Number of values to pre-pull before waiting for synchronizes
- `readPattern` (Pattern): Pattern describing TRead (yielded values)
- `readReturnPattern` (Pattern): Pattern describing TReadReturn (return value)

#### `iterateReader(readerRef, options?)`

Convert a remote `PassableReader` reference to a local
`AsyncIterableIterator<TRead>` (initiator side).

**Options:**
- `buffer` (number, default 0): Number of values to pre-synchronize
- `readPattern` (Pattern): Pattern to validate each TRead value
- `readReturnPattern` (Pattern): Pattern to validate TReadReturn

#### `makeReaderPump(iterator, options?)`

Core responder pump machinery for readers.
Takes a local iterator and returns a pump function suitable for use as
the `stream` method on a custom Exo.

Use this when building custom Exos that need reader streaming alongside
other methods.

**Options:**
- `buffer` (number, default 0): Number of values to pre-pull

### Writer Modules

#### `writerFromIterator(iterator, options?)`

Wrap a local sink iterator as a `PassableWriter` Exo
(responder side).
Each value received from the initiator is pushed to the iterator via
`iterator.next(value)`.

**Options:**
- `buffer` (number, default 0): Number of flow-control acks to pre-send
- `writePattern` (Pattern): Pattern describing TWrite (yielded values)
- `writeReturnPattern` (Pattern): Pattern describing TWriteReturn (return value)

#### `iterateWriter(writerRef, options?)`

Create a local writer iterator that sends values to a remote `PassableWriter`
(initiator side). Use `writer.next(value)` to push values and `writer.return()`
to close the stream.

**Options:**
- `buffer` (number, default 0): Number of data values to pre-send before waiting for acks
- `writePattern` (Pattern): Pattern to validate each TWrite value
- `writeReturnPattern` (Pattern): Pattern to validate TWriteReturn

#### `makeWriterPump(iterator, options?)`

Core responder pump machinery for writers.
Takes a local sink iterator and returns a pump function suitable for use as
the `stream` method on a custom Exo.

**Options:**
- `buffer` (number, default 0): Number of flow-control acks to pre-send

### Bytes Reader Modules

#### `bytesReaderFromIterator(bytesIterator, options?)`

Wrap a local `AsyncIterator<Uint8Array>` as a `PassableBytesReader` Exo.
Bytes are automatically base64-encoded for transmission over CapTP.

Uses `streamBase64()` method instead of `stream()` to allow future migration
to direct bytes transport when CapTP supports it.

**Options:**
- `buffer` (number, default 0): Number of values to pre-pull
- `readReturnPattern` (Pattern): Pattern describing TReadReturn (return value)

#### `iterateBytesReader(bytesReaderRef, options?)`

Convert a remote `PassableBytesReader` reference to a local
`AsyncIterableIterator<Uint8Array>`.
Base64 strings are automatically decoded to bytes.

**Options:**
- `buffer` (number, default 0): Number of values to pre-synchronize
- `readReturnPattern` (Pattern): Pattern to validate TReadReturn
- `stringLengthLimit` (number): Maximum base64 string length per chunk

### Bytes Writer Modules

#### `bytesWriterFromIterator(iterator, options?)`

Wrap a local sink iterator as a `PassableBytesWriter` Exo.
Base64 strings received from the initiator are automatically decoded to
`Uint8Array` before being pushed to the iterator.

Uses `streamBase64()` method instead of `stream()` to allow future migration
to direct bytes transport when CapTP supports it.

**Options:**
- `buffer` (number, default 0): Number of flow-control acks to pre-send
- `writeReturnPattern` (Pattern): Pattern describing TWriteReturn (return value)

#### `iterateBytesWriter(bytesWriterRef, options?)`

Create a local bytes writer iterator that sends `Uint8Array` values to a remote
`PassableBytesWriter` (initiator side). Use `writer.next(chunk)` to push values
and `writer.return()` to close the stream. Bytes are automatically base64-encoded
for transmission over CapTP.

**Options:**
- `buffer` (number, default 0): Number of data values to pre-send before waiting for acks

### Migration Path for Bytes Streams

Currently, bytes are transmitted as base64-encoded strings via `streamBase64()`.
When CapTP and pass-style support direct binary transport, bytes-streamable
Exos can implement the `stream()` method directly, allowing initiators to
gracefully transition to using `iterateReader()` instead of
`iterateBytesReader()`, and `iterateWriter()` instead of
`iterateBytesWriter()`.

## Design

See [DESIGN.md](./DESIGN.md) for design documentation.

## Protocol Specification

See [PROTOCOL.md](./PROTOCOL.md) for the formal protocol specification,
suitable for implementation in other languages or proposal to OCapN.

## Future Work

- Support direct binary transport when CapTP supports it.
- Add help methods to Exos for usage guidance.
- Propose protocol to OCapN working group.
