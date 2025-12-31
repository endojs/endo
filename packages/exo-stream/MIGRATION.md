# Migration Plan: `@endo/daemon` → `@endo/exo-stream`

## Overview

This document describes the completed migration from `@endo/daemon`'s iterator/reader ref utilities to `@endo/exo-stream`.

## Completed Migration

### Old API (Removed)

From `@endo/daemon/reader-ref.js` (REMOVED):
- `makeIteratorRef(iterable)` → `FarRef<Reader<T>>` - Wrap local iterator as remote reference
- `makeReaderRef(readable)` → `FarRef<Reader<string>>` - Wrap local bytes iterator, encode to base64 (now `PassableBytesReader`)

From `@endo/daemon/ref-reader.js` (REMOVED):
- `makeRefIterator(iteratorRef)` → `AsyncIterableIterator<T>` - Wrap remote iterator as local
- `makeRefReader(readerRef)` → `AsyncIterableIterator<Uint8Array>` - Wrap remote bytes iterator, decode from base64

### New API in `@endo/exo-stream`

| Old Function | New Function | Notes |
|--------------|--------------|-------|
| `makeIteratorRef(iterable)` | `streamIterator(iterable)` | Returns `PassableStream` with `stream()` method |
| `makeReaderRef(readable)` | `streamBytesIterator(readable)` | Returns `PassableBytesReader` with `stream()` method |
| `makeRefIterator(iteratorRef)` | `iterateStream(streamRef)` | Async; uses bidirectional promise chains |
| `makeRefReader(readerRef)` | `iterateBytesStream(streamRef)` | Async; uses bidirectional promise chains |

### Key Differences

1. **New protocol**: The new API uses bidirectional promise chains. The
   initiator sends synchronizes to induce the responder to send data. Unlike
   naive protocols that require a method invocation to cause progress, with
   buffer > 1, promise chain nodes propagate via CapTP before the event loop
   yields to I/O, keeping the responder busy while the initiator processes
   values.

2. **Import paths**: No barrel exports; each function imported from its own module:
   ```javascript
   // New API
   import { streamIterator } from '@endo/exo-stream/stream-iterator.js';
   import { iterateStream } from '@endo/exo-stream/iterate-stream.js';
   import { streamBytesIterator } from '@endo/exo-stream/stream-bytes-iterator.js';
   import { iterateBytesStream } from '@endo/exo-stream/iterate-bytes-stream.js';
   ```

3. **Async consumer functions**: `iterateStream` and `iterateBytesStream` are
   async (return `Promise<AsyncIterableIterator>`) because they call `stream()`
   first.

4. **New options**: Consumer functions accept options for buffering and pattern validation:
   ```javascript
   const reader = iterateStream(streamRef, { buffer: 3, pattern: M.number() });
   ```

## Migration Examples

### Producer: Creating stream references

```javascript
// Before (daemon)
import { makeIteratorRef } from '@endo/daemon/reader-ref.js';
followNameChanges: () => makeIteratorRef(directory.followNameChanges()),

// After (exo-stream)
import { streamIterator } from '@endo/exo-stream/stream-iterator.js';
followNameChanges: () => streamIterator(directory.followNameChanges()),
```

```javascript
// Before (daemon)
import { makeReaderRef } from '@endo/daemon/reader-ref.js';
const blobRef = makeReaderRef(bytesIterator);

// After (exo-stream)
import { streamBytesIterator } from '@endo/exo-stream/stream-bytes-iterator.js';
const blobRef = streamBytesIterator(bytesIterator);
```

### Consumer: Iterating stream references

```javascript
// Before (daemon)
import { makeRefIterator } from '@endo/daemon/ref-reader.js';
for await (const message of makeRefIterator(E(powers).followMessages())) {
  // ...
}

// After (exo-stream)
import { iterateStream } from '@endo/exo-stream/iterate-stream.js';
for await (const message of iterateStream(E(powers).followMessages())) {
  // Note: await before for-await because iterateStream is async
}
```

```javascript
// Before (daemon)
import { makeRefReader } from '@endo/daemon/ref-reader.js';
for await (const chunk of makeRefReader(blobRef)) {
  // chunk is Uint8Array
}

// After (exo-stream)
import { iterateBytesStream } from '@endo/exo-stream/iterate-bytes-stream.js';
for await (const chunk of await iterateBytesStream(blobRef)) {
  // chunk is Uint8Array
}
```

## Files Migrated

### Daemon Package
- ✅ `src/directory.js` - Uses `streamIterator`
- ✅ `src/host.js` - Uses `streamIterator`
- ✅ `src/guest.js` - Uses `streamIterator`
- ✅ `src/daemon.js` - Uses `iterateBytesStream`
- ✅ `src/daemon-node-powers.js` - Uses `streamBytesIterator`
- ✅ `reader-ref.js` - REMOVED
- ✅ `ref-reader.js` - REMOVED

### CLI Package
- ✅ `src/commands/bundle.js` - Uses `streamBytesIterator`
- ✅ `src/commands/cat.js` - Uses `iterateBytesStream`
- ✅ `src/commands/follow.js` - Uses `iterateStream`
- ✅ `src/commands/inbox.js` - Uses `iterateStream`
- ✅ `src/commands/install.js` - Uses `streamBytesIterator`
- ✅ `src/commands/list.js` - Uses `iterateStream`
- ✅ `src/commands/make.js` - Uses `streamBytesIterator`
- ✅ `src/commands/store.js` - Uses `streamBytesIterator`
- ✅ `demo/cat.js` - Uses `iterateStream`

### Tests
- ✅ `daemon/test/endo.test.js` - Uses `iterateStream` and `iterateBytesStream`
