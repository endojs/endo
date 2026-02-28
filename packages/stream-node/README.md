# `@endo/stream-node`

Adapters for Node.js streams to Endo's async iterable streams.

## Overview

This package provides functions to adapt Node.js [`Readable`][node-readable] and [`Writable`][node-writable]
streams to Endo's stream interface, which models streams as hardened async
iterators of `Uint8Array` chunks.

See [`@endo/stream`](../stream/README.md) for more about Endo's stream model.

## Usage

### Reading from a Node.js stream

`makeNodeReader` adapts a Node.js [`Readable`][node-readable] stream to an Endo reader:

```js
import { makeNodeReader } from '@endo/stream-node';

const reader = makeNodeReader(process.stdin);

for await (const chunk of reader) {
  // chunk is a Uint8Array
  console.log('received', chunk.byteLength, 'bytes');
}
```

### Writing to a Node.js stream

`makeNodeWriter` adapts a Node.js [`Writable`][node-writable] stream to an Endo writer:

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

Adapts a Node.js [`Readable`][node-readable] stream to an Endo reader.

- Converts Node.js [`Buffer`][node-buffer] chunks to `Uint8Array`
- The stream must not be in [object mode][node-object-mode]
- The stream must not have an [encoding set][node-readable-set-encoding]

**Parameters:**
- `input` - A Node.js [`Readable`][node-readable] stream

**Returns:** A `Reader<Uint8Array>` async iterator

### `makeNodeWriter(output)`

Adapts a Node.js [`Writable`][node-writable] stream to an Endo writer.

- Respects [backpressure][node-backpressure] via the [`drain` event][node-drain]
- The stream must not be in [object mode][node-object-mode]

**Parameters:**
- `output` - A Node.js [`Writable`][node-writable] stream

[node-readable]: https://nodejs.org/api/stream.html#class-streamreadable
[node-writable]: https://nodejs.org/api/stream.html#class-streamwritable
[node-buffer]: https://nodejs.org/api/buffer.html#class-buffer
[node-object-mode]: https://nodejs.org/api/stream.html#object-mode
[node-readable-set-encoding]: https://nodejs.org/api/stream.html#readablesetencodingencoding
[node-backpressure]: https://nodejs.org/api/stream.html#backpressure
[node-drain]: https://nodejs.org/api/stream.html#event-drain

**Returns:** A `Writer<Uint8Array>` with `next`, `return`, and `throw` methods

## Hardened JavaScript

This package depends on Hardened JavaScript.
The environment must be locked down before use, typically via `@endo/init`.

## License

[Apache-2.0](./LICENSE)
