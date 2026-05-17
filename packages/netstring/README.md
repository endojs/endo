# `@endo/netstring`

Async iterator streams for [Netstring][] protocol.

## Overview

A netstring is a simple binary protocol for length-prefixed frames, using
decimal strings as variable-width integers.
For example, the frame `5:hello,` corresponds to the message `hello`, where
`5` is the length of `hello` in bytes.

This package provides `makeNetstringReader` and `makeNetstringWriter` to
encode and decode netstrings as async iterators of `Uint8Array` chunks.

See [`@endo/stream`](../stream/README.md) for more about Endo's stream model.

## Usage

### Reading netstrings

`makeNetstringReader` decodes a stream of bytes into individual messages:

```js
import { makeNetstringReader } from '@endo/netstring';

const reader = makeNetstringReader(byteStream, {
  name: 'my-stream',              // optional, for error messages, default <unknown>
  maxMessageLength: 999_999_999 , // optional, default 999,999,999
});

for await (const message of reader) {
  // message is a Uint8Array containing one complete frame
  console.log(new TextDecoder().decode(message));
}
```

### Writing netstrings

`makeNetstringWriter` encodes messages with netstring framing:

```js
import { makeNetstringWriter } from '@endo/netstring';

const writer = makeNetstringWriter(outputStream);

const encoder = new TextEncoder();
await writer.next(encoder.encode('hello'));
await writer.next(encoder.encode('world'));
await writer.return();
```

### Writing chunked messages

Messages can be passed as arrays of chunks to avoid pre-concatenation:

```js
const encoder = new TextEncoder();
await writer.next([
  encoder.encode('hello'),
  encoder.encode(' '),
  encoder.encode('world'),
]);
// Writes: "11:hello world,"
```

### Round-trip example

```js
import { makePipe } from '@endo/stream';
import { makeNetstringReader, makeNetstringWriter } from '@endo/netstring';

const [input, output] = makePipe();
const writer = makeNetstringWriter(output);
const reader = makeNetstringReader(input);

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Producer
await writer.next(encoder.encode('hello'));
await writer.next(encoder.encode('world'));
await writer.return();

// Consumer
for await (const message of reader) {
  console.log(decoder.decode(message));
}
// Output: hello
// Output: world
```

## API

### `makeNetstringReader(input, options?)`

Creates a reader that decodes netstring-framed messages from a byte stream.

**Parameters:**
- `input` - An `Iterable<Uint8Array>` or `AsyncIterable<Uint8Array>`
- `options.name` - Optional name for error messages
- `options.maxMessageLength` - Maximum allowed message size (default: 999999999)

**Returns:** A `Reader<Uint8Array>` async iterator yielding decoded messages.

### `makeNetstringWriter(output, options?)`

Creates a writer that encodes messages with netstring framing.

**Parameters:**
- `output` - A `Writer<Uint8Array, undefined>` from `@endo/stream`
- `options.chunked` - Enable zero-copy mode for streams that support
  consecutive writes without waiting (default: false)

**Returns:** A `Writer<Uint8Array, undefined>` that frames messages.

## Protocol

The Netstring format is:

```
<length>:<data>,
```

Where:
- `<length>` is the byte length of `<data>` as a decimal ASCII string
- `:` is a literal colon separator
- `<data>` is the raw message bytes
- `,` is a literal comma terminator

Examples:
- `0:,` - empty message
- `5:hello,` - the string "hello"
- `11:hello world,` - the string "hello world"

## Hardened JavaScript

This package depends on Hardened JavaScript.
The environment must be locked down before use, typically via `@endo/init`.

## References

[Netstring][]
D. J. Bernstein
1997-02-01

## License

[Apache-2.0](./LICENSE)

[Netstring]: https://cr.yp.to/proto/netstrings.txt
