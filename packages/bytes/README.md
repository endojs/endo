# `@endo/bytes`

`@endo/bytes` provides a minimal set of portable `Uint8Array` helpers
for cross-realm byte handling.
Endo runs in three byte-handling realms:
Node (where `Buffer` is ambient),
XS (no `Buffer`),
and SES-locked compartments
(where `Uint8Array` is the only portable byte container).
This package is the canonical home for the `Uint8Array` helpers that
those realms share.

See `designs/endo-bytes.md` for the audit of pre-existing duplicates
and the rationale for the API surface.

## Install

```sh
npm install @endo/bytes
```

## Usage

```js
import { bytesFromText } from '@endo/bytes/from-string.js';
import { bytesToText } from '@endo/bytes/to-string.js';
import { concatBytes } from '@endo/bytes/concat.js';
import { bytesEqual } from '@endo/bytes/equals.js';
import { bytesToImmutable } from '@endo/bytes/to-immutable.js';
import { bytesFromImmutable } from '@endo/bytes/from-immutable.js';

const a = bytesFromText('Hello, ');
const b = bytesFromText('world!');
const greeting = concatBytes([a, b]);
bytesToText(greeting); // 'Hello, world!'

bytesEqual(bytesFromText('abc'), bytesFromText('abc')); // true

// Wrap a Uint8Array in a passable, immutable ArrayBuffer.
const passable = bytesToImmutable(greeting);
// Recover a working Uint8Array from an immutable buffer received over a vat boundary.
bytesToText(bytesFromImmutable(passable)); // 'Hello, world!'
```

The package is exported as per-symbol subpath modules so that callers
import qualified names without needing a namespace import.

## API

### `concatBytes(chunks) -> Uint8Array`

Concatenates a list of `Uint8Array` chunks into a single contiguous
`Uint8Array`.
Empty input yields an empty `Uint8Array`.

### `bytesEqual(a, b) -> boolean`

Compares two `Uint8Array` values byte-for-byte.
Returns `true` when the two arrays have equal length and equal contents.

### `bytesFromText(s) -> Uint8Array`

Encodes a string as UTF-8 bytes.

### `bytesToText(view) -> string`

Decodes UTF-8 bytes to a string.

### `bytesToImmutable(view) -> ArrayBuffer`

Wraps a `Uint8Array` view's contents in an immutable `ArrayBuffer` via
the `ArrayBuffer.prototype.sliceToImmutable` shim
(proposal-immutable-arraybuffer).
The result carries the `'byteArray'` passStyle and is hardened, so it
is safe to share across vat boundaries.
The view's `byteOffset` and `byteLength` are honored, so `subarray`
windows copy only the addressed bytes.

### `bytesFromImmutable(buffer) -> Uint8Array`

Copies the contents of an immutable `ArrayBuffer` into a fresh,
mutable `Uint8Array`.
Immutable `ArrayBuffer` instances cannot back a `Uint8Array` view
directly and APIs such as `TextDecoder.decode` reject them; this
helper produces a working `Uint8Array` copy that callers can pass to
those APIs.

## Out of scope

For other byte operations, prefer existing packages or built-in
methods.

- Slicing: use `Uint8Array.prototype.subarray` (no copy) or
  `Uint8Array.prototype.slice` (copy).
- Hex encoding and decoding: use `@endo/hex`.
- Base64 encoding and decoding: use `@endo/base64`.
- Streaming concatenation: compose `concatBytes` with a `for await`
  loop; see `@endo/stream` and `@endo/stream-node` for stream primitives.

## Hardened JavaScript

Every export is hardened.
The `TextEncoder` and `TextDecoder` instances backing `bytesFromText`
and `bytesToText` are captured once at module load, so post-lockdown
mutation of the corresponding globals cannot redirect the dispatched
calls.
The modules have no other mutable state.
