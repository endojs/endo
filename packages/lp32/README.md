# `@endo/lp32`

Length-prefixed message streams using 32-bit host byte order framing,
implemented as async iterators.

## Overview

This package implements the binary message framing protocol used by
[WebExtension Native Messaging][native-messaging].
Each message is prefixed with a 32-bit unsigned integer indicating the message
length in bytes, using host byte order.

The protocol is simple:
- A 4-byte length prefix (uint32, host byte order)
- Followed by the message payload of that length

For example, a 5-byte message `hello` is transmitted as:
```
[0x05, 0x00, 0x00, 0x00] [h, e, l, l, o]
```

This package provides hardened async iterator streams for reading and writing
these length-prefixed messages, represented as `Uint8Array`s.

[native-messaging]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging

## Usage

### Reading Messages

Use `makeLp32Reader` to wrap an async iterable of byte chunks and produce
an async iterable of complete messages:

```js
import { makeLp32Reader } from '@endo/lp32';

const reader = makeLp32Reader(byteStream, {
  name: '<my-stream>',        // optional, for error messages
  maxMessageLength: 1024 * 1024, // optional, defaults to 1MB
});

for await (const message of reader) {
  // message is a Uint8Array containing one complete message
  console.log(new TextDecoder().decode(message));
}
```

### Writing Messages

Use `makeLp32Writer` to wrap an output stream and automatically frame
messages with length prefixes:

```js
import { makeLp32Writer } from '@endo/lp32';

const writer = makeLp32Writer(outputStream, {
  name: '<my-writer>',
  maxMessageLength: 1024 * 1024,
});

const encoder = new TextEncoder();
await writer.next(encoder.encode('hello'));
await writer.next(encoder.encode('world'));
await writer.return();
```

### Round-Trip Example

```js
import { makePipe } from '@endo/stream';
import { makeLp32Reader, makeLp32Writer } from '@endo/lp32';

const [input, output] = makePipe();
const writer = makeLp32Writer(output);
const reader = makeLp32Reader(input);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Producer
await writer.next(encoder.encode('message 1'));
await writer.next(encoder.encode('message 2'));
await writer.return();

// Consumer
for await (const message of reader) {
  console.log(decoder.decode(message));
}
```

## API

### `makeLp32Reader(reader, options?)`

Creates a reader that decodes length-prefixed messages from a byte stream.

**Parameters:**
- `reader` - An `Iterable<Uint8Array>` or `AsyncIterable<Uint8Array>`
- `options.name` - Optional name for error messages
- `options.maxMessageLength` - Maximum allowed message size (default: 1MB)
- `options.initialCapacity` - Initial buffer size (default: 1024)

**Returns:** An async iterator yielding `Uint8Array` messages.

### `makeLp32Writer(output, options?)`

Creates a writer that encodes messages with length prefixes.

**Parameters:**
- `output` - A `Writer<Uint8Array, undefined>` from `@endo/stream`
- `options.name` - Optional name for error messages
- `options.maxMessageLength` - Maximum allowed message size (default: 1MB)

**Returns:** A `Writer<Uint8Array, undefined>` that frames messages.

## Hardened JavaScript

This package depends on Hardened JavaScript.
The environment must be locked down before use, typically via `@endo/init`.
All exported functions and the streams they produce are hardened.

## Install

```sh
npm install @endo/lp32
```

Or with yarn:

```sh
yarn add @endo/lp32
```

## License

[Apache-2.0](./LICENSE)
