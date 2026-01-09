# `@endo/stream-node`

Adapters for Node.js streams to Endo's async iterable streams.

## Overview

This package provides functions to adapt Node.js `Readable` and `Writable`
streams to Endo's stream interface, which models streams as hardened async
iterators of `Uint8Array` chunks.

See [`@endo/stream`](../stream/README.md) for more about Endo's stream model.

## Usage

### Reading from a Node.js stream

`makeNodeReader` adapts a Node.js `Readable` stream to an Endo reader:

```js
import { makeNodeReader } from '@endo/stream-node';

const reader = makeNodeReader(process.stdin);

for await (const chunk of reader) {
  // chunk is a Uint8Array
  console.log('received', chunk.byteLength, 'bytes');
}
```

### Writing to a Node.js stream

`makeNodeWriter` adapts a Node.js `Writable` stream to an Endo writer:

```js
import { makeNodeWriter } from '@endo/stream-node';

const writer = makeNodeWriter(process.stdout);

await writer.next(new TextEncoder().encode('Hello, world!\n'));
await writer.return();
```

### Implementing `cat`

A complete example that pipes stdin to stdout:

```js
import '@endo/init';
import { pump } from '@endo/stream';
import { makeNodeReader, makeNodeWriter } from '@endo/stream-node';

const reader = makeNodeReader(process.stdin);
const writer = makeNodeWriter(process.stdout);
await pump(writer, reader);
```

## API

### `makeNodeReader(input)`

Adapts a Node.js `Readable` stream to an Endo reader.

- Converts Node.js `Buffer` chunks to `Uint8Array`
- The stream must not be in object mode
- The stream must not have an encoding set

**Parameters:**
- `input` - A Node.js `Readable` stream

**Returns:** A `Reader<Uint8Array>` async iterator

### `makeNodeWriter(output)`

Adapts a Node.js `Writable` stream to an Endo writer.

- Respects back-pressure via the `drain` event
- The stream must not be in object mode

**Parameters:**
- `output` - A Node.js `Writable` stream

**Returns:** A `Writer<Uint8Array>` with `next`, `return`, and `throw` methods

## Hardened JavaScript

This package depends on Hardened JavaScript.
The environment must be locked down before use, typically via `@endo/init`.

## License

[Apache-2.0](./LICENSE)
