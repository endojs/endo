# Migration Plan: `@endo/daemon` to `@endo/exo-stream`

## Overview

This document describes the completed migration from `@endo/daemon`'s
iterator/reader ref utilities to `@endo/exo-stream`.

## Completed Migration

### Old API (Removed)

From `@endo/daemon/reader-ref.js` (REMOVED):
- `makeIteratorRef(iterable)` to `FarRef<Reader<T>>` -
  Wrap local iterator as remote reference
- `makeReaderRef(readable)` to `FarRef<Reader<string>>` -
  Wrap local bytes iterator, encode to base64
  (now `PassableBytesReader`)

From `@endo/daemon/ref-reader.js` (REMOVED):
- `makeRefIterator(iteratorRef)` to `AsyncIterableIterator<T>` -
  Wrap remote iterator as local
- `makeRefReader(readerRef)` to `AsyncIterableIterator<Uint8Array>` -
  Wrap remote bytes iterator, decode from base64

### New API in `@endo/exo-stream`

#### Readers (data flows responder to initiator)

| Old Function | New Function | Module | Notes |
|---|---|---|---|
| `makeIteratorRef(iterable)` | `readerFromIterator(iterable)` | `reader-from-iterator.js` | Returns `PassableReader` Exo with `stream()` method |
| `makeRefIterator(iteratorRef)` | `iterateReader(readerRef)` | `iterate-reader.js` | Synchronous; returns `AsyncIterableIterator` |

#### Writers (data flows initiator to responder)

| New Function | Module | Notes |
|---|---|---|
| `writerFromIterator(iterator)` | `writer-from-iterator.js` | Returns `PassableWriter` Exo with `stream()` method |
| `iterateWriter(writerRef, options?)` | `iterate-writer.js` | Returns a local writer iterator; use `next(value)` to send and `return()` to close |

#### Bytes Readers (base64 encoding over CapTP)

| Old Function | New Function | Module | Notes |
|---|---|---|---|
| `makeReaderRef(readable)` | `bytesReaderFromIterator(readable)` | `bytes-reader-from-iterator.js` | Returns `PassableBytesReader` with `streamBase64()` method |
| `makeRefReader(readerRef)` | `iterateBytesReader(readerRef)` | `iterate-bytes-reader.js` | Synchronous; returns `AsyncIterableIterator<Uint8Array>` |

#### Bytes Writers (base64 encoding over CapTP)

| New Function | Module | Notes |
|---|---|---|
| `bytesWriterFromIterator(iterator)` | `bytes-writer-from-iterator.js` | Returns `PassableBytesWriter` Exo with `streamBase64()` method |
| `iterateBytesWriter(writerRef, options?)` | `iterate-bytes-writer.js` | Returns a local bytes writer iterator; use `next(chunk)` to send and `return()` to close |

### Key Differences

1. **New protocol**: The new API uses bidirectional promise chains.
   The initiator sends synchronizes to induce the responder to send
   data.
   Unlike naive protocols that require a method invocation to cause
   progress, with buffer > 0, promise chain nodes propagate via CapTP
   before the event loop yields to I/O, keeping the responder busy
   while the initiator processes values.

2. **Import paths**: No barrel exports; each function imported from
   its own module:
   ```javascript
   // Readers
   import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
   import { iterateReader } from '@endo/exo-stream/iterate-reader.js';

   // Writers
   import { writerFromIterator } from '@endo/exo-stream/writer-from-iterator.js';
   import { iterateWriter } from '@endo/exo-stream/iterate-writer.js';

   // Bytes Readers
   import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
   import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';

   // Bytes Writers
   import { bytesWriterFromIterator } from '@endo/exo-stream/bytes-writer-from-iterator.js';
   import { iterateBytesWriter } from '@endo/exo-stream/iterate-bytes-writer.js';
   ```

3. **Synchronous consumer functions**: `iterateReader` and
   `iterateBytesReader` return `AsyncIterableIterator` directly (not
   wrapped in a Promise).

4. **New options**: Consumer functions accept options for buffering
   and pattern validation:
   ```javascript
   import { M } from '@endo/patterns';
   const reader = iterateReader(readerRef, {
     buffer: 3,
     readPattern: M.number(),
   });
   ```

## Migration Examples

### Producer: Creating reader references

```javascript
// Before (daemon)
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
followNameChanges: () => makeIteratorRef(directory.followNameChanges()),

// After (exo-stream)
import { readerFromIterator } from '@endo/exo-stream/reader-from-iterator.js';
followNameChanges: () => readerFromIterator(directory.followNameChanges()),
```

```javascript
// Before (daemon)
import { makeReaderRef } from '@endo/daemon/reader-ref.js';
const blobRef = makeReaderRef(bytesIterator);

// After (exo-stream)
import { bytesReaderFromIterator } from '@endo/exo-stream/bytes-reader-from-iterator.js';
const blobRef = bytesReaderFromIterator(bytesIterator);
```

### Consumer: Iterating reader references

```javascript
// Before (daemon)
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
for await (const message of makeRefIterator(E(powers).followMessages())) {
  // ...
}

// After (exo-stream)
import { iterateReader } from '@endo/exo-stream/iterate-reader.js';
for await (const message of iterateReader(E(powers).followMessages())) {
  // ...
}
```

```javascript
// Before (daemon)
import { makeRefReader } from '@endo/daemon/ref-reader.js';
for await (const chunk of makeRefReader(blobRef)) {
  // chunk is Uint8Array
}

// After (exo-stream)
import { iterateBytesReader } from '@endo/exo-stream/iterate-bytes-reader.js';
for await (const chunk of iterateBytesReader(blobRef)) {
  // chunk is Uint8Array
}
```

### Writer: Sending data to a remote consumer

```javascript
// After (exo-stream) — no daemon equivalent
import { writerFromIterator } from '@endo/exo-stream/writer-from-iterator.js';
import { iterateWriter } from '@endo/exo-stream/iterate-writer.js';
import { makePipe } from '@endo/stream';

// Responder: wrap a local sink as a PassableWriter
const [pipeReader, pipeWriter] = makePipe();
const writerRef = writerFromIterator(pipeWriter);

// Initiator: push data to remote PassableWriter
const writer = iterateWriter(writerRef);
for await (const value of localDataIterator) {
  await writer.next(value);
}
await writer.return();
```

## Files Migrated

### Daemon Package

- `src/directory.js` - Uses `readerFromIterator`
- `src/host.js` - Uses `readerFromIterator`
- `src/guest.js` - Uses `readerFromIterator`
- `src/daemon.js` - Uses `iterateBytesReader`
- `src/daemon-node-powers.js` - Uses `bytesReaderFromIterator`
- `reader-ref.js` - REMOVED
- `ref-reader.js` - REMOVED

### CLI Package

- `src/commands/bundle.js` - Uses `bytesReaderFromIterator`
- `src/commands/cat.js` - Uses `iterateBytesReader`
- `src/commands/follow.js` - Uses `iterateReader`
- `src/commands/inbox.js` - Uses `iterateReader`
- `src/commands/install.js` - Uses `bytesReaderFromIterator`
- `src/commands/list.js` - Uses `iterateReader`
- `src/commands/make.js` - Uses `bytesReaderFromIterator`
- `src/commands/store.js` - Uses `bytesReaderFromIterator`
- `demo/cat.js` - Uses `iterateReader`

### Tests

- `daemon/test/endo.test.js` - Uses `iterateReader` and
  `iterateBytesReader`
