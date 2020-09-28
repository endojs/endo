# @agoric/varint

This is an implementation of variable width integer encoding consistent with
[Protobuf].

[Protobuf]: https://developers.google.com/protocol-buffers/docs/encoding

```js
import { uint32 } from '@agoric/varint';

const input = 1729;
const length = uint32.measure(input);
console.log(length);
// 2

const buffer = new Uint8Array(length);
uint32.write(buffer, input, 0);
console.log(buffer);
// Uint8Array(2) [ 193, 13 ]

const output = uint32.read(buffer, 0);
console.log(output);
// 1729
```

## Differences from Chris Dickinson's `varint`

The implementation differs from the `varint` package by Chris Dickinson, to
whom we are grateful for the reference implementation.

* Only supports 32 bit unsigned integers.
  JavaScript supports integers with up to 53 bits of precision,
  but not up to 64.
  Limiting to 32 bits of precision allows for a simpler implementation
  and avoids risking a false sense of correctness for numbers with possibly
  more than 53 bits of mantissa.
* `encode` is called `uint32.write`.
  * the byte array argument is required.
  * returns the offset after the encoded bytes.
  * does not update its own `encode.bytes` with the number of encoded bytes.
  * does not return the given byte array.
* `decode` is called `read`.
  * does not update its own `decode.bytes` with the number of decoded bytes.
* `encodingLength` is called `measure`.

Not assigning `bytes` to its exported functions makes these functions pure and
consequently the exported API can be frozen and shared by mutually suspicious
packages without risk of them using the API surface to eavesdrop on each other.
