# Shared Canonical CBOR Primitives (`@endo/cbor`)

| | |
|---|---|
| **Created** | 2026-07-12 |
| **Author** | Kris Kowal (prompted) |
| **Status** | Proposed |

## What is the Problem Being Solved?

The repository now carries three parallel JavaScript implementations
of the same canonical CBOR subset, plus a Rust twin:

| Implementation | Lines | Subset |
|---|---|---|
| `packages/slots/src/cbor.js` (PR [#124](https://github.com/endojs/endo-but-for-bots/pull/124), `slot-machine` branch) | ~245 | uint, byte string, definite array, null; minimal-length heads |
| `packages/ocapn/src/cbor/encode.js` + `decode.js` | ~1300 | the same head grammar plus text strings, maps, tags 2/3/27/280/55799, floats, simple values |
| `packages/daemon/src/envelope.js` (`cborAppendHead` and kin) | ~130 of 389 | uint, negint, byte string, text string, definite array; minimal-length heads |
| `rust/endo/slots/src/wire/codec.rs` (PR #124) | ~60 | the slots subset, byte-identical with `packages/slots/src/cbor.js` |

Each of the three JavaScript files re-implements the identical core:
write a CBOR head (major type in the top three bits, argument in the
shortest form per RFC 8949 section 4.2.1's core deterministic encoding
requirements), read a head back (rejecting indefinite-length forms and
invalid additional-info values), and frame byte strings, arrays, and
null around it. The `ocapn` implementation layers OCapN protocol
policy on top (bignum integers, selector tag 280, record tag 27,
structure tracking for its `OcapnReader` / `OcapnWriter` interface),
but its module-level primitive helpers (`writeTypeAndLength`,
`writeBytestring`, `writeString`, `writeFloat64`, `parseTypeByte`,
`readArgument`, `readBytestring`, `readString`, `readTag`) are the
same functions as the slots file's `writeHead`, `writeByteString`,
`readHead`, `readByteString` with different spellings.

Reviewing PR #124, the maintainer asked for exactly this
consolidation:

> Please also post a follow-up job to refactor slot-machine and ocapn
> CBOR since we are using the same subset for these and likely can
> share utilities.

This design names the shared subset, proposes a home for it, and lays
out the migration path for both call sites (with the daemon envelope
codec as an optional third adopter).

### The common subset

Both slot-machine and ocapn rely on, and only on:

1. **Canonical head encoding.** Major type + argument, always in the
   shortest form (arguments 0 to 23 inline; 1, 2, 4, or 8 extension
   bytes otherwise), per RFC 8949 section 4.2.1.
2. **Head decoding** that rejects indefinite-length markers
   (additional info 31) and reserved additional-info values 28 to 30.
3. **Definite-length byte strings** (major 2) with truncation checks.
4. **Definite-length arrays** (major 4).
5. **Null** (and, on the ocapn side, the sibling simple values false,
   true, undefined).
6. **Unsigned integer heads** (major 0): slots uses them for kind
   bytes and positions; ocapn uses the same head arithmetic for
   lengths and tag numbers.
7. **Strict end-of-input discipline**: unexpected EOF mid-head or
   mid-payload throws; slots additionally asserts full consumption
   (`assertConsumed`).

Beyond the shared subset, ocapn alone needs: text strings (major 3),
maps (major 5), tags (major 6, specifically 2/3 bignums per RFC 8949
section 3.4.3, 27 record, 280 selector, 55799 per section 3.4.6),
float64 with a canonical NaN, and the remaining simple values. All of
these are still plain RFC 8949 grammar, not OCapN policy, so they
belong in the shared module too; slots simply will not import them.

## Naming

**Package: `@endo/cbor` at `packages/cbor/`.** A repository search
returns no existing `cbor` package. "CBOR" is the canonical acronym
for Concise Binary Object Representation and is permitted under the
namer's rule on canonical acronyms. `@endo/cbor` names the codec
primitives for one CBOR item; the framing sibling landed as
`@endo/cbor-frame` — proposed as `@endo/cbors` in
[cbors.md](cbors.md), implemented under the explicit `-frame` suffix in
[PR #288](https://github.com/endojs/endo-but-for-bots/pull/288) — and
names a *stream* of length-prefixed byte strings on the wire. The two
packages are complements, not competitors: `@endo/cbor-frame` frames
opaque payload bytes, `@endo/cbor` encodes and decodes the bytes inside
a frame. The `-frame` suffix keeps the two names from colliding.

**Identifier style follows the slots file**: `writeUint`,
`writeByteString`, `writeArrayHeader`, `readUint`, `readByteString`,
`readArrayHeader`, `assertConsumed` keep their current spellings so
the slots migration is import-path-only. The ocapn spellings
(`writeBytestring`, `readArgument`) are the ones that change.

## Design

### Scope

`@endo/cbor` is a **single-item primitive codec**: hardened functions
that write and read one CBOR item at a time against an explicit
writer or reader state. It is deliberately not:

- a value codec (no `encode(anyValue)` / `decode(bytes)` that maps
  JavaScript values to CBOR by reflection);
- a framing package (that is `@endo/cbor-frame`);
- an OCapN codec (record labels, selectors-as-symbols, bignum-only
  integer policy, structure validation stacks, and the
  `OcapnReader` / `OcapnWriter` interface all stay in
  `packages/ocapn`).

Definite-length only; indefinite-length containers and strings are
rejected on read and unwritable, matching both current
implementations.

### API surface

```js
// packages/cbor/index.js
// Writer state: a growing byte buffer.
export const makeCborWriter = (opts = {}) => { ... };   // { capacity? }
export const cborWriterBytes = writer => { ... };       // -> Uint8Array

// Head primitives (the shared core).
export const writeHead = (writer, major, value) => { ... };
export const writeUint = (writer, n) => { ... };        // major 0
export const writeInt = (writer, n) => { ... };         // major 0 or 1
export const writeByteString = (writer, bytes) => { ... };
export const writeTextString = (writer, str) => { ... };
export const writeArrayHeader = (writer, n) => { ... };
export const writeMapHeader = (writer, n) => { ... };
export const writeTag = (writer, tag) => { ... };
export const writeBoolean = (writer, b) => { ... };
export const writeNull = writer => { ... };
export const writeUndefined = writer => { ... };
export const writeFloat64 = (writer, x) => { ... };     // canonical NaN
export const writeBignum = (writer, bigint) => { ... }; // tags 2/3

// Reader state over a Uint8Array.
export const makeCborReader = (bytes, opts = {}) => { ... }; // { name? }
export const readHead = reader => { ... };              // -> { major, value }
export const peekHead = reader => { ... };              // no advance
export const readUint = reader => { ... };
export const readInt = reader => { ... };
export const readByteString = reader => { ... };        // -> fresh Uint8Array
export const readTextString = reader => { ... };        // fatal UTF-8
export const readArrayHeader = reader => { ... };
export const readMapHeader = reader => { ... };
export const readTag = reader => { ... };
export const readBoolean = reader => { ... };
export const readFloat64 = reader => { ... };           // canonical-NaN check
export const readBignum = reader => { ... };
export const readOptionalNull = reader => { ... };      // consume null if next, -> boolean
export const assertConsumed = reader => { ... };
```

Every export is hardened immediately after declaration. Errors use
`@endo/errors` (`makeError`, `X`, `q`) and carry the reader's `name`
and byte offset, uniting the slots error style with the ocapn
diagnostic convention (`... at index N of <name>`).

### Number domain

*Amended per maintainer review of endojs/endo-but-for-bots#755: the
original draft of this section put head arguments in the number
domain behind a `Number.isSafeInteger` guard. Safe integers in the
int53 range are an aberration of JavaScript, not a fact about the
CBOR domain, so that guard advertised the language's limitation as if
it were the protocol's.*

Head arguments are **bigints**, spanning the full unsigned 64-bit
range a CBOR head can carry (`writeHead`, `writeUint`, `writeInt`,
`readHead`, `readUint`, `readInt`). Bignum values (`writeBignum`,
`readBignum`) are unbounded bigints. Working in bigint also removes
the `Math.floor(value / 0x100…)` decomposition the int53
representation forced on the writer: an eight-byte argument is
emitted with ordinary bigint shifts.

**Counts stay in the number domain**, because their range genuinely
is limited to four bytes: byte-string and text-string byte lengths,
array and map element counts, and tag numbers are all capped by
JavaScript itself at `2**32 - 1`. A reader that meets a well-formed
but wider length head rejects it rather than truncating.

### Canonicality posture

- **Writers are always canonical.** Minimal-length heads, canonical
  NaN (`0x7ff8000000000000`), minimal-length bignum byte strings
  (no leading zero bytes, empty for zero). There is no option to emit
  a non-minimal head. This preserves the slot-machine's byte-identity
  contract with `rust/endo/slots/src/wire/codec.rs` and ocapn's
  signature-stability requirement.
- **Readers are tolerant by default, strict by option.** Today
  neither implementation rejects a non-minimal head on read (the
  ocapn decoder validates canonical NaN but accepts, say, a length 5
  encoded in two bytes). `makeCborReader(bytes, { strict: true })`
  additionally rejects non-minimal heads and non-minimal bignum
  payloads. The canonical-NaN check in `readFloat64` stays
  unconditional, matching current ocapn behavior. Whether ocapn
  should enable `strict` for its signature-verification paths is an
  Open Question; the shared module makes it a one-line decision
  instead of a rewrite.

### Buffer state

The writer owns a growing `Uint8Array` (doubling capacity, `subarray`
on extraction), replacing the slots file's `number[]` accumulator
(which boxes every byte) without importing the syrup
`BufferWriter` / `BufferReader` classes. Those classes stay where
they are: extracting them entrains a syrup refactor that this design
does not need, since the CBOR primitives require only append, read-N,
and peek. A later extraction of generic byte cursors into
`@endo/bytes` remains open as a follow-up (tracking issue to be
filed) and would not change this package's API.

The reader state is a plain record over the input `Uint8Array` with
an index, a `name`, and the `strict` flag. `readByteString` returns a
fresh `Uint8Array` copy (the slots behavior); immutability conversion
(`bytesToImmutable` from `@endo/bytes`) remains ocapn policy at its
class layer.

### Dependencies

```json
{
  "dependencies": {
    "@endo/errors": "workspace:^",
    "@endo/harden": "workspace:^"
  }
}
```

Text-string well-formedness (today checked in ocapn via
`isWellFormedString` from `@endo/pass-style`) uses the engine-native
`String.prototype.isWellFormed` so the package does not entrain
`@endo/pass-style`; engine availability is an Open Question with a
small local fallback as the escape hatch.

### What moves, what stays

| Site | Moves to `@endo/cbor` | Stays behind |
|---|---|---|
| `packages/slots/src/cbor.js` | The whole file (its API is a subset of the shared surface, same names) | `payload.js`, `descriptor.js` verb and descriptor shapes; the interop tests, retargeted |
| `packages/ocapn/src/cbor/encode.js` | `writeTypeByte`, `writeTypeAndLength`, `writeTag`, `bigintToMinimalBytes`, `writeBytestring`, `writeString`, `writeBoolean`, `writeInteger` (as `writeBignum`), `writeFloat64` | `CborWriter` class (structure stack, record labels, `OcapnWriter` interface), `makeCborWriter`'s tagged-value helper, tag-number constants used by the codec layer |
| `packages/ocapn/src/cbor/decode.js` | `parseTypeByte`, `readArgument` (as `readHead`), `readBytestring`, `readString`, `readBoolean`, `bytesToBigint`, `readTag`, `readInteger` (as `readBignum`), `readFloat64` | `CborReader` class, `peekType` type-hinting, immutability conversion, diagnostic-notation codec |
| `packages/daemon/src/envelope.js` (optional) | `cborAppendHead`, `cborAppendInt`, `cborAppendBytes`, and the matching read side | Envelope framing and the `[handle, verb, payload, nonce]` protocol shape |
| `rust/endo/slots/src/wire/codec.rs` | Nothing (Rust stays put) | Everything; parity is enforced by shared test vectors |

## Migration Path

Phased so each step is independently landable and verifiable:

1. **Create `packages/cbor`** with the API above and the merged test
   suite: the vector tests from `packages/slots/test/cbor.test.js`
   (PR #124) and the primitive-level cases from
   `packages/ocapn/test/cbor/{encode,decode}.test.js`, plus a golden
   hex-vector fixture (see Test Plan). Base per the repository's
   base-branch inference rule: `master`, merged forward to `llm` and
   `endor` in the ordinary course.
2. **Migrate ocapn.** Replace the module-level helpers in
   `encode.js` / `decode.js` with imports; the `CborWriter` /
   `CborReader` classes and the `OcapnCodec` surface are unchanged.
   Acceptance: byte-for-byte identical output on the existing ocapn
   CBOR and interop test suites (error message wording may change;
   `name` + offset diagnostics must survive).
3. **Migrate slot-machine** once PR #124 lands: delete
   `packages/slots/src/cbor.js`, point `payload.js` and
   `descriptor.js` imports at `@endo/cbor`, keep
   `packages/slots/test/cbor.test.js` retargeted at the package (or
   fold it into `packages/cbor/test/`). Acceptance: the slots
   adversarial and end-to-end suites plus the Rust parity CI lane
   (`.github/workflows/rust-endor.yml`) stay green, proving the
   byte-identity contract with `rust/endo/slots` held.
4. **Optional: migrate the daemon envelope codec** and revisit the
   `@endo/cbor-frame` framing design, which may import `writeHead` /
   `readHead` for its byte-string heads. Its recorded decision to
   duplicate head-parsing scaffolding for independent auditability
   ([cbors.md](cbors.md) section Dependencies) predates a shared
   primitive package existing; whether to supersede that decision is
   left to the maintainer at implementation time.

Sequencing note: phase 1 and 2 do not depend on PR #124 merging;
phase 3 does. If PR #124 instead rebases onto a landed phase 1, the
slots package can adopt `@endo/cbor` before merge and shed its
`src/cbor.js` in flight; either order preserves the invariants.

## Relationship to existing packages

| Package | Role |
|---|---|
| `@endo/cbor` (this design) | Encodes and decodes single CBOR items; the primitive layer |
| [`@endo/cbor-frame`](cbors.md) (impl PR #288; proposed as `@endo/cbors`) | Frames a stream of length-prefixed CBOR byte strings; payload bytes are opaque |
| [`@endo/syrup-frame`](ocapn-tcp-syrups-framing.md) (landed on `llm`; proposed as `@endo/syrups`) | The Syrup-grammar framing sibling |
| `@endo/netstring` | The netstring-grammar framing sibling |
| `packages/ocapn` | OCapN protocol codec; becomes a consumer |
| `packages/slots` (PR #124) | Slot-machine wire protocol; becomes a consumer |
| `packages/daemon` (`envelope.js`) | Engo bus envelope protocol; candidate consumer |

## Test Plan

- **Golden vectors.** A checked-in fixture of `(diagnostic, hex)`
  pairs covering every argument-width boundary (0, 23, 24, 255, 256,
  65535, 65536, 2^32 - 1, 2^32, `Number.MAX_SAFE_INTEGER`), every
  major type in scope, canonical NaN, bignum edge cases (0n, -1n,
  leading-zero rejection), and the simple values. The same fixture is
  asserted from `packages/cbor/test/` and mirrored into
  `rust/endo/slots` tests so JavaScript/Rust byte identity is checked
  from both sides.
- **Ported suites.** All cases from `packages/slots/test/cbor.test.js`
  and the primitive-level cases from
  `packages/ocapn/test/cbor/{encode,decode}.test.js`.
- **Strict-mode cases.** Non-minimal heads accepted by default,
  rejected under `strict`; non-canonical NaN rejected always;
  indefinite-length and reserved additional-info bytes rejected
  always; truncated head, truncated payload, trailing bytes.
- **Migration acceptance.** Phases 2 and 3 rerun the consumers'
  existing suites unchanged (ocapn interop tests, slots end-to-end
  and adversarial tests, Rust parity CI) as the proof that outputs
  did not move.

## Design Decisions

1. **A new leaf package, not a dependency between the consumers.**
   Slots depending on `packages/ocapn` would entrain a full protocol
   package into a deliberately minimal wire client; ocapn depending
   on slots inverts the layering (a protocol depending on a sibling
   protocol for its byte codec). A shared leaf both can import is the
   only shape that keeps both consumers honest.
2. **Not an extension of `@endo/cbor-frame`.** That design scopes itself
   to framing only and explicitly excludes codec duties
   ([cbors.md](cbors.md) section Scope); grafting a codec onto it
   would break its recorded contract. Considered and rejected:
   one combined CBOR package. Reason: framing and item codecs have
   different consumers and different audit surfaces.
3. **Hardened functional API, classes stay in ocapn.** The shared
   layer follows the slots file's shape (pure functions over explicit
   state, hardened exports) because it is the smaller, more auditable
   surface and the style native to this repository; ocapn's
   `CborWriter` / `CborReader` classes survive as adapters that
   implement OCapN's interface atop the primitives.
4. **Bigint heads, number counts.** A head argument's domain is the
   full uint64 range, which only `bigint` represents; counts are
   bounded to four bytes by JavaScript itself, so `number` is exact
   and honest there. Superseded the original "safe-integer heads"
   choice on maintainer review (see *Number domain*).
5. **Canonical writers, strict readers, no lenient mode.** Byte
   identity with Rust and signature stability demand canonical
   writes. Reads are strict with no opt-out: every implementation of
   this subset is required to use the strict, canonical subset
   (maintainer review of endojs/endo-but-for-bots#755), so tolerating
   a non-canonical encoding would only launder a peer's bug into this
   side's byte-identity contract.
6. **Own buffer state rather than extracting syrup's
   `BufferWriter` / `BufferReader`.** Keeps the package
   dependency-light and the migration surface small; a generic
   byte-cursor extraction into `@endo/bytes` is a separable follow-up
   (tracking issue to be filed).

## Open Questions

1. **Is `@endo/cbor` acceptable alongside the framing package?**
   Resolved by the implementation: the framing sibling landed as
   `@endo/cbor-frame` (PR #288), not the near-collision `@endo/cbors`
   this section originally weighed, so the codec/framing distinction is
   now carried by an explicit `-frame` suffix rather than a single
   trailing letter. `@endo/cbor` stays as the primitive-codec name.
2. **Should ocapn's signature-verification paths construct readers
   with `strict: true`?** Today non-minimal heads pass its decoder,
   so two byte-different encodings of the same value can both
   verify. Enabling strict tightens this; it may also reject traffic
   from tolerant peers. Maintainer call at phase 2.
3. **Is `String.prototype.isWellFormed` available on every supported
   engine, XS included?** Slots runs under the XS worker
   (`packages/daemon/src/bus-worker-xs.js`). If XS lacks it, the
   package carries a small local well-formedness check instead of a
   `@endo/pass-style` dependency.
4. **Where does phase 1 land relative to PR #124?** The design
   assumes `master` first with forward-merges to `llm` and `endor`,
   and slots adopting post-merge (phase 3). If the maintainer prefers
   the package to exist before #124 merges so the PR never ships its
   private copy, phase 1 can target the `endor` line first.

## Prompt

> Please also post a follow-up job to refactor slot-machine and ocapn
> CBOR since we are using the same subset for these and likely can
> share utilities.

(kriskowal, review of
[endojs/endo-but-for-bots#124](https://github.com/endojs/endo-but-for-bots/pull/124#pullrequestreview-4680255190),
2026-07-12.)
