# @endo/cbor

Canonical, hardened primitives for reading and writing **one CBOR item** at a
time against an explicit writer or reader state. It is the shared codec layer
that the slot-machine wire protocol (`packages/slots`) and the OCapN codec
(`packages/ocapn`) both build on, factored out per
[`designs/cbor-codec.md`](../../designs/cbor-codec.md) so the same canonical
subset is not re-implemented per consumer.

`@endo/cbor` is deliberately **not**:

- a reflective value codec (there is no `encode(anyValue)` / `decode(bytes)`);
- a framing package — that is [`@endo/cbor-frame`](../cbor-frame/README.md), which
  frames a stream of length-prefixed byte strings while this package encodes the
  bytes inside a frame;
- an OCapN codec — record labels, selectors, structure-validation stacks, and the
  `OcapnReader` / `OcapnWriter` interface stay in `packages/ocapn` as a consuming
  adapter.

Definite-length only: indefinite-length containers and strings are rejected on
read and are unwritable.

## Canonicality

- **Writers are always canonical.** Minimal-length heads (RFC 8949 §4.2.1),
  canonical NaN (`0x7ff8000000000000`), and minimal-length bignum byte strings.
  There is no option to emit a non-minimal head; this preserves the slot-machine's
  byte-identity contract with its Rust twin and OCapN's signature stability.
- **Readers are strict by default.** A reader rejects non-minimal heads and
  non-minimal bignum payloads, so no two byte-different encodings of a value both
  decode. `makeCborReader(bytes, { lenient: true })` restores the tolerant
  behavior for interop with a peer that emits non-canonical heads. **Non-canonical
  NaN is rejected in every mode.**

## Usage

```js
import {
  makeCborWriter,
  cborWriterBytes,
  writeUint,
  writeByteString,
  makeCborReader,
  readUint,
  readByteString,
  assertConsumed,
} from '@endo/cbor';

const writer = makeCborWriter();
writeUint(writer, 42);
writeByteString(writer, new Uint8Array([1, 2, 3]));
const bytes = cborWriterBytes(writer);

const reader = makeCborReader(bytes, { name: 'example' });
readUint(reader); // 42
readByteString(reader); // Uint8Array [1, 2, 3]
assertConsumed(reader);
```

Head arguments are JavaScript numbers guarded by `Number.isSafeInteger`; bignum
values (`writeBignum` / `readBignum`, CBOR tags 2/3) are bigints. Errors carry the
reader's `name` and byte offset (`... at index N of <name>`).

## Golden vectors

`test/vectors.js` is the checked-in canonical fixture and `test/golden-vectors.json`
its language-neutral mirror, prepared so the Rust twin
(`rust/endo/slots/src/wire/codec.rs`) can assert byte identity from its side once
the slots migration wires up the Rust parity CI lane.
