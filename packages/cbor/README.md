# @endo/cbor

Canonical, hardened primitives for reading and writing **one CBOR item** at a
time against an explicit writer or reader state. It is the codec layer the
slot-machine wire protocol (`packages/slots`) and the OCapN codec
(`packages/ocapn`) are to share, factored out per
[`designs/cbor-codec.md`](../../designs/cbor-codec.md) so that the same canonical
subset is not re-implemented per consumer. Phase 1 publishes the package; those
two consumers migrate onto it in phases 2 and 3, so nothing depends on it yet.

`@endo/cbor` is deliberately **not**:

- a reflective value codec (there is no `encode(anyValue)` / `decode(bytes)`);
- a framing package — that is `@endo/cbor-frame`, a later phase of
  [`designs/cbor-codec.md`](../../designs/cbor-codec.md), which frames a stream of
  length-prefixed byte strings while this package encodes the bytes inside a
  frame;
- an OCapN codec — record labels, selectors, structure-validation stacks, and the
  `OcapnReader` / `OcapnWriter` interface stay in `packages/ocapn` as a consuming
  adapter.

Definite-length only: indefinite-length containers and strings are rejected on
read and are unwritable.

## Canonicality

- **Writers are always canonical.** Minimal-length heads for the *integer*
  arguments of majors 0 to 6 (RFC 8949 §4.2.1), canonical NaN
  (`0x7ff8000000000000`), and minimal-length bignum byte strings. There is no
  option to emit a non-minimal head; this preserves the slot-machine's
  byte-identity contract with its Rust twin and OCapN's signature stability.
- **This subset deviates from §4.2.1 on floats, deliberately.** Core
  deterministic encoding also requires the shortest float form (§4.2.1) and
  `0xf97e00` for NaN (§4.2.2). This codec always writes float64 (`0xfb`) and
  writes NaN as `fb7ff8000000000000`, and its reader rejects the float16 and
  float32 widths a §4.2.1-conforming encoder would emit. That keeps one width on
  the wire for the slot-machine's byte-identity contract, at the cost of full
  §4.2.1 interoperability. Treat it as an interop constraint, not a nit.
- **Readers are strict.** A reader rejects non-minimal heads and non-minimal
  bignum payloads, so no two byte-different encodings of a value both decode.
  **Non-canonical NaN is rejected too.** There is no lenient mode: every
  implementation of this subset is required to use the strict, canonical subset,
  so accepting a non-canonical encoding would only launder a peer's bug into this
  side's byte-identity contract.

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
writeUint(writer, 42n);
writeByteString(writer, new Uint8Array([1, 2, 3]));
const bytes = cborWriterBytes(writer);

const reader = makeCborReader(bytes, { name: 'example' });
readUint(reader); // 42n
readByteString(reader); // Uint8Array [1, 2, 3]
assertConsumed(reader);
```

## Numeric domain

A CBOR head argument spans the full unsigned 64-bit range, so `writeHead`,
`writeUint`, `writeInt`, `readHead`, `readUint`, and `readInt` speak **`bigint`**.
That is the honest domain: `Number` cannot represent it, and a safe-integer guard
would only be a JavaScript artifact masquerading as a protocol rule. Bignum values
(`writeBignum` / `readBignum`, CBOR tags 2/3) are unbounded bigints.

**Counts stay `number`**: byte-string and text-string byte lengths, array and map
element counts, and tag numbers. This codec bounds each to `[0, 2**32)`. That is
its own profile choice, not a limit JavaScript imposes: the language caps only
array lengths there, typed-array lengths are spec-bounded at `2**53 - 1`, and a
CBOR tag number may run to `2**64 - 1` (RFC 8949 §3.4). Within that bound the
arithmetic is exact and `number` is the honest type. A reader that meets a
well-formed but wider head rejects it rather than truncating.

Errors carry the reader's `name` and byte offset (`... at index N of <name>`).

## Golden vectors

`test/golden-vectors.json` is the single checked-in fixture: the source of truth
for this package's canonical encoding, consumed directly by `test/cbor.test.js`
and language-neutral so the Rust twin (`rust/endo/slots/src/wire/codec.rs`) can
assert byte identity from its side once the slots migration wires up the Rust
parity CI lane. Fifty of its entries are published in RFC 8949 Appendix A, so the
fixture is anchored to an external authority rather than to this implementation.

Each entry is `{ diagnostic, value, hex }`, plus `rfc8949: true` on the published
ones. `hex` is the exact byte sequence a canonical writer must emit and a strict
reader must accept and fully consume. `value` is a language-neutral spec of the
item, a single-key object naming the CBOR kind:

| Spec | Item |
| --- | --- |
| `{"uint": "<decimal>"}` | major 0, argument in `[0, 2**64)` |
| `{"int": "<decimal>"}` | major 0 or 1, in `[-2**64, 2**64)` |
| `{"bytes": "<hex>"}` | major 2 byte string |
| `{"text": "<string>"}` | major 3 text string |
| `{"array": [<spec>, ...]}` | major 4 header followed by its elements |
| `{"map": [[<spec>, <spec>], ...]}` | major 5 header followed by its entries |
| `{"tag": <number>}` | a bare major 6 head, with no item after it |
| `{"tagged": [<number>, <spec>]}` | a major 6 head followed by its item |
| `{"bool": true \| false}` | `0xf5` / `0xf4` |
| `{"simple": "null" \| "undefined"}` | `0xf6` / `0xf7` |
| `{"float64": "<repr>"}` | `0xfb` head; `NaN`, `Infinity`, `-Infinity`, and `-0` are spelled out because JSON can express none of them |
| `{"bignum": "<decimal>"}` | tag 2 or 3 over a minimal-length byte string |

The fixture exercises every argument-width and length-head boundary, the extremes
of each representable kind (lowest and highest code point, smallest subnormal and
largest finite float64, `2**64 - 1` and the first value past it), and containers
nested several levels deep with mixed value kinds.
