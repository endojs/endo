# CBOR Byte-String Framing (`@endo/cbors`)

| | |
|---|---|
| **Created** | 2026-05-04 |
| **Updated** | 2026-05-04 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Not Started |

## What is the Problem Being Solved?

The Endo daemon's bus protocol exchanges length-prefixed payloads
between the Node host and the Rust supervisor
(see `packages/daemon/src/envelope.js`,
`packages/daemon/src/bus-xs-core.js`).
Today, that exchange is built on a private hand-rolled length envelope.
A second consumer (the prospective `endor` Rust daemon, the XS worker
snapshot pipeline) is on the way.

What is missing is a small, focused framing primitive that buffers a
stream of length-prefixed byte strings on the wire, using the CBOR
byte-string head as its length encoding.
This package is the precise CBOR-shaped analog of `@endo/netstring`
and of the proposed `@endo/syrup-frame`
(see [`ocapn-tcp-syrup-framing.md`](./ocapn-tcp-syrup-framing.md),
PR 29 in `endojs/endo-but-for-bots`, not yet landed):
each names a different on-the-wire grammar for length-prefixed byte
strings.
Note: PR 29's package is queued to be renamed from `@endo/syrup-frame`
to `@endo/syrups` for naming consistency with `@endo/cbors`
(see [`syrups.md`](./syrups.md)).
References below use the in-flight name `@endo/syrup-frame`; the
rename is the steward's next dispatch.

This package is deliberately **not** a CBOR codec.
It does not understand CBOR integers, arrays, maps, floats, or tags
beyond what is needed to read and write the byte-string head.
A consumer that wants to send structured CBOR uses any CBOR codec it
likes to produce a `Uint8Array`, hands that array to the writer, and
the writer wraps it in a CBOR byte-string head that names its length.
The reader returns the payload bytes; the consumer decodes them as it
sees fit.

The reader and writer mirror `@endo/netstring`'s shape.
Reading a stream is `for await (const bytes of makeCborsReader(input))`;
writing is `await writer.next(bytes)`.
The diagnostic surface (the `name` option, the `maxMessageLength`
ceiling, error wording) follows the same conventions.

## Naming

**Package: `@endo/cbors`.**
A repository search returns no `cbors` package, so law 1 is clear.
The plural form names "a sequence of length-prefixed byte strings on
the wire, each headed in CBOR's grammar."
The proposed sibling `@endo/syrup-frame` (PR 29; not yet landed)
names the analogous package whose grammar is Syrup's byte-string
record (`<digits>:<payload>`).
See [`ocapn-tcp-syrup-framing.md`](./ocapn-tcp-syrup-framing.md).
"CBOR" is the canonical acronym for Concise Binary Object
Representation and is therefore permitted under the namer's rule on
canonical acronyms.

We rejected `@endo/cbor-frame` (mirroring `@endo/syrup-frame`)
because the package frames a *sequence* of byte strings, and the
plural form `cbors` keeps this property visible.

**Reader and writer identifiers: `makeCborsReader` and
`makeCborsWriter`.**
This replicates the netstring naming exactly
(`makeNetstringReader`, `makeNetstringWriter`); operators familiar
with one will read the other without translation.
No legacy `cborsReader` / `cborsWriter` aliases (the package is new).

## Design

### Scope

`@endo/cbors` is byte-string framing only.
The package implements just enough of [RFC
8949](https://www.rfc-editor.org/rfc/rfc8949.html) to read and write
the head bytes for a CBOR byte string (major type 2), optionally
wrapped in CBOR tag 24 (Encoded CBOR data item, major type 6).
It does not parse or emit any other CBOR type.
A reader that encounters bytes whose initial byte is not a permitted
byte-string head (or a permitted tag 24 wrapping a byte-string head)
throws.

This narrow scope keeps the package small, auditable, and free of
dependencies on a full CBOR codec.

### API shape

```js
// index.js
export { makeCborsReader } from './reader.js';
export { makeCborsWriter } from './writer.js';
```

```js
/**
 * @param {Iterable<Uint8Array> | AsyncIterable<Uint8Array>} input
 * @param {object} [opts]
 * @param {string} [opts.name]
 * @param {number} [opts.maxMessageLength]
 * @returns {import('@endo/stream').Reader<Uint8Array, undefined>}
 */
export const makeCborsReader = (input, opts) => { ... };
```

```js
/**
 * @param {import('@endo/stream').Writer<Uint8Array, undefined>} output
 * @param {object} [opts]
 * @param {boolean} [opts.chunked]
 * @param {boolean} [opts.tagged]
 * @param {string} [opts.name]
 * @returns {import('@endo/stream').Writer<Uint8Array, undefined>}
 */
export const makeCborsWriter = (output, opts) => { ... };
```

The `name` and `maxMessageLength` semantics are identical to
`@endo/netstring`.
Both reader and writer carry **byte strings** at their boundaries: the
writer's `next` accepts a `Uint8Array`, and the reader yields a
`Uint8Array`.
The optional `tagged` option on the writer requests that each frame be
wrapped in CBOR tag 24 (see Wire format below).
The reader accepts both wrapped and unwrapped frames transparently.

### Wire format

The wire is a concatenation of length-prefixed CBOR byte strings.
Each frame is one of:

1. **Plain byte-string head plus payload.**
   Major type 2 (byte string) with an argument that names the payload
   length, followed by the payload bytes.
   The argument follows CBOR's standard short forms: 0 through 23
   inline in the initial byte; 24/25/26/27 followed by 1, 2, 4, or 8
   length bytes.
2. **Tag-24-wrapped byte string.**
   Major type 6 (tagged) with argument 24 (Encoded CBOR data item;
   [RFC 8949 § 3.4.5.1][rfc8949-tag24]), followed by a plain byte
   string as in (1).
   The reader recognizes this wrapping and returns the inner payload
   bytes.

[rfc8949-tag24]: https://www.rfc-editor.org/rfc/rfc8949.html#section-3.4.5.1

The reader rejects any other initial byte (any major type other than
2, or major 6 with any tag other than 24, or any indefinite-length
form).
This is intentional: a stricter reader catches misframed input
earlier and gives a clearer error than a permissive one.

A specimen stream carrying two byte strings, the 5-byte payload
`hello` and the 1-byte payload `A`, encodes plain (without tag 24) as
the byte sequence (hex):

```
45 68 65 6c 6c 6f 41 41
```

Read top to bottom: `45` is "byte string of length 5" (major 2,
argument 5 inline); `68 65 6c 6c 6f` is the payload `hello`; `41` is
"byte string of length 1" (major 2, argument 1 inline); `41` is the
payload `A`.

The same stream wrapped in tag 24 (writer set with `tagged: true`)
encodes as:

```
d8 18 45 68 65 6c 6c 6f d8 18 41 41
```

where `d8 18` is "tag 24" (major 6, argument 24 in the next byte).

### Reader behavior

The reader consumes incoming `Uint8Array` chunks and feeds a small
state machine that recognizes the CBOR byte-string head (with or
without a leading tag-24 wrapper).
On each iteration:

1. Wait until the head bytes are present (1 to 9 bytes for a plain
   byte-string head; 3 to 11 bytes when wrapped in tag 24).
2. Decode the declared length.
3. Wait until the declared payload bytes have arrived.
4. Yield the payload as a `Uint8Array`.
5. Retain any unread suffix as the prefix of the next frame.

If the input stream ends mid-frame (an incomplete head, a payload
shorter than the declared length, an unterminated tag wrapper), the
reader throws with a message that identifies the stream `name` and
the byte offset where the truncated frame began.
This mirrors `@endo/netstring`'s "Unexpected dangling message at
offset" error.

The `maxMessageLength` cap is enforced *before* allocation: when the
head declares a payload length greater than the cap, the reader
throws without buffering the payload.

### Writer behavior

The writer accepts a `Uint8Array` per `next(bytes)` call and emits
one CBOR byte-string frame per call.
With `tagged: false` (the default), the frame is the plain
byte-string head followed by the payload.
With `tagged: true`, the frame is the tag-24 wrapper followed by the
plain byte-string head followed by the payload.

The head uses the shortest argument form (the canonical RFC 8949 §
4.2 encoding for the length).

Writer mode follows the netstring template:

- Default (`chunked: false`): one `output.next` per frame.
- `chunked: true`: the writer may split the encoded bytes into
  multiple `output.next` calls so the underlying stream can apply
  backpressure mid-frame.

`return()` and `throw()` propagate to the underlying byte writer.

### Harden discipline

Every named export is hardened immediately after declaration:
`harden(makeCborsReader)`, `harden(makeCborsWriter)`.
The reader and writer return hardened async iterators.
Yielded `Uint8Array` payloads are returned as-is (callers may freeze
them if they wish; the reader does not, to keep the hot path
allocation-free).

### Dependencies

```json
{
  "dependencies": {
    "@endo/harden": "workspace:^",
    "@endo/init": "workspace:^",
    "@endo/promise-kit": "workspace:^",
    "@endo/stream": "workspace:^"
  }
}
```

This is the same dependency set as `@endo/netstring`.
The package does not depend on any CBOR codec library, on
`@endo/netstring`, or on `@endo/syrup-frame`.
The three framing packages are peers: taking a dependency on one of
them does not entrain a dependency on any of the others.
A small amount of head-parsing scaffolding is duplicated across the
three rather than extracted into a shared "framing primitives"
package, so that each can be adopted independently and audited on
its own.

### Specimen example

```js
import { makeCborsReader, makeCborsWriter } from '@endo/cbors';
import { makePipe } from '@endo/stream';

const [input, output] = makePipe();
const writer = makeCborsWriter(output);
const reader = makeCborsReader(input);

const enc = new TextEncoder();
await writer.next(enc.encode('hello'));
await writer.next(enc.encode('A'));
await writer.return();

const dec = new TextDecoder();
for await (const bytes of reader) {
  console.error(dec.decode(bytes));
}
// hello
// A
```

## Relationship to existing packages

| Package | Role |
|---|---|
| [`@endo/netstring`](../packages/netstring/) | Frames byte payloads as `<digits>:<bytes>,` |
| `@endo/syrup-frame` ([PR 29](./ocapn-tcp-syrup-framing.md), proposed, not yet landed) | Frames byte payloads as `<digits>:<bytes>` |
| `@endo/cbors` (this design) | Frames byte payloads as a CBOR byte-string head plus payload, optionally wrapped in CBOR tag 24 |
| `packages/daemon/src/envelope.js` | Inline CBOR codec for the engo bus envelope protocol; a candidate consumer of `@endo/cbors` for the framing layer |

`@endo/netstring` (which exists today),
`@endo/syrup-frame` ([proposed in PR 29](./ocapn-tcp-syrup-framing.md),
not yet landed), and `@endo/cbors` (this design) are intended as
sibling packages.
Each frames a sequence of byte payloads using a different head
grammar.
A consumer that wants the netstring grammar takes a dependency on
`@endo/netstring` and gets nothing else; a consumer that wants the
syrup-frame grammar (once it lands) would take `@endo/syrup-frame`
only; a consumer that wants the CBOR-byte-string grammar takes
`@endo/cbors` only.
None of the three depends on any of the others, and adopting one
does not entrain the rest.

The daemon's existing inline encoder is the obvious migration target
for the framing layer: once `@endo/cbors` exists, the engo envelope
protocol can drop its private head-bytes code and use the streaming
reader and writer for that layer.
The daemon would still encode and decode the *contents* of each frame
with whatever CBOR codec it likes.
That migration is out of scope here; this design only delivers the
framing package.

## Test Plan

Tests are ported from `packages/netstring/test/netstring.test.js` and
adapted to the CBOR byte-string head grammar.

Cases to port:

- Read short frames (zero-length, 1-byte, 23-byte, 24-byte, 256-byte,
  65 537-byte payloads, exercising each argument-width form).
- Read short frames with bytes divided over chunk boundaries (the
  central test for streaming correctness).
- Read a frame in a single chunk.
- Read a frame with payload bytes in a separate chunk.
- Read a frame with payload bytes divided over a chunk boundary.
- Read multiple frames divided over chunk boundaries.
- Read a head divided over chunk boundaries (head length varies
  between 1 and 9 bytes).
- Round-trip short frames, with and without `chunked`.
- Round-trip short frames with and without `tagged`.
- Round-trip a stream that mixes tagged and untagged frames (writer
  toggles `tagged`; reader accepts both).
- Concurrent writes, with and without `chunked`.
- Round-trip varying frames of growing size.
- Writer closes anywhere within a frame (back-pressure scenario).

Cases that are CBOR-specific:

- Reject any initial byte whose major type is not 2 (and not 6 with
  argument 24 wrapping a major-2 head).
- Reject indefinite-length byte strings (initial byte `0x5f`).
- Reject a tag-24 wrapper followed by anything other than a plain
  byte-string head.
- Reject a length argument exceeding `maxMessageLength` without
  buffering the payload.
- Reject a truncated head (initial byte without all argument bytes
  before end-of-stream).
- Reject a truncated payload (head declares N bytes; fewer arrive
  before end-of-stream).
- Round-trip with the `name` option set; verify error messages
  include the configured name.
- Verify the writer always emits the shortest argument form for the
  length (canonical encoding).

Test file: `packages/cbors/test/cbors.test.js`.

## Design Decisions

1. **Byte-string framing only.**
   The package implements only enough of CBOR to read and write a
   byte-string head, optionally wrapped in tag 24.
   It does not parse or emit any other CBOR type.
   This keeps the package small, auditable, and useful as a peer of
   `@endo/netstring` and the proposed `@endo/syrup-frame` (PR 29).
   Consumers that want to carry structured CBOR encode or decode the
   payload bytes themselves with whatever CBOR codec they prefer.

2. **Use CBOR tag 24 for the wrapping.**
   When the writer's `tagged` option is set, each frame is wrapped in
   CBOR tag 24 (Encoded CBOR data item; [RFC 8949 §
   3.4.5.1][rfc8949-tag24]).
   That tag is defined precisely for byte strings whose contents are
   themselves CBOR, which is the common consumer of this package.
   Wrapping in tag 24 makes the wire format self-describing to a
   generic CBOR-aware packet analyzer: the analyzer can drop into the
   payload and continue parsing.
   The reader accepts both wrapped and unwrapped frames so that a
   peer that does not bother with the tag still interoperates.

3. **Reject indefinite-length and non-byte-string forms outright.**
   The reader's tolerance is the place where new attack surface
   appears.
   By rejecting any initial byte that is not a recognized byte-string
   head (or tag-24 wrapper of one), the package keeps its decision
   surface tight and makes interop bugs surface as clear errors at
   the wire boundary instead of as confused payloads downstream.

## Open Questions

1. **Should `@endo/cbors` (and other framing packages) live next to
   `@endo/netstring` or under a `framing/` subtree?**
   Today `@endo/netstring` lives at top level
   (`packages/netstring/`); the proposed `@endo/syrup-frame` (PR 29,
   not yet landed) follows the same pattern.
   Sibling consistency suggests `packages/cbors/` at top level, but a
   future `packages/framing/` subtree could be argued for once the
   family grows past four or five members.
   This is a layout question, not a design question, and is presented
   for maintainer taste.

2. **Should `tagged: true` be the default?**
   Tag-24 wrapping costs two bytes per frame and helps generic CBOR
   analyzers.
   If the dominant consumer is a peer that always carries CBOR, the
   default could be tagged; if many consumers carry opaque bytes, the
   default should remain untagged.
   The initial recommendation is `tagged: false` (untagged) because
   it minimizes surprise for peers that do not expect a wrapping
   byte.

## Prompt

> Please dispatch a designer to propose two designs. I would like a
> design that creates a replica of the netstring proposal for sequential
> Syrup byte string messages (consider name: syrups) and a similar
> package that encodes and decodes sequential CBOR byte arrays.
