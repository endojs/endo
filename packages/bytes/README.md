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

const a = bytesFromText('Hello, ');
const b = bytesFromText('world!');
const greeting = concatBytes([a, b]);
bytesToText(greeting); // 'Hello, world!'

bytesEqual(bytesFromText('abc'), bytesFromText('abc')); // true
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
and `bytesToText` are captured once at module load and frozen, so
post-lockdown mutation of the corresponding globals cannot redirect the
dispatched calls.
The modules have no other mutable state.
