# `@endo/hex`

`@endo/hex` encodes and decodes between `Uint8Array` and hexadecimal
strings.
It is a ponyfill for the TC39 `Uint8Array.prototype.toHex` and
`Uint8Array.fromHex` intrinsics (proposal-arraybuffer-base64, Stage 4).

On engines that ship the native intrinsics, `encodeHex` and `decodeHex`
dispatch to them at module load time.
On older engines, and in SES-locked-down compartments where a realm
has removed the intrinsics, the package falls through to a portable
pure-JavaScript implementation.

## Install

```sh
npm install @endo/hex
```

## Usage

```js
import { encodeHex, decodeHex } from '@endo/hex';

encodeHex(new Uint8Array([0xb0, 0xb5, 0xc4, 0xfe])); // 'b0b5c4fe'
decodeHex('b0b5c4fe'); // Uint8Array(4) [0xb0, 0xb5, 0xc4, 0xfe]
```

## API

### `encodeHex(bytes) -> string`

Encodes a `Uint8Array` as a lowercase hex string.
Callers that need uppercase can call `.toUpperCase()` on the result.

### `decodeHex(string, name?) -> Uint8Array`

Decodes a hex string to a `Uint8Array`.
Accepts both upper- and lowercase input.
Throws on odd-length strings and on characters outside `[0-9a-fA-F]`.
The optional `name` parameter is included in error messages for
diagnostic context.

## Hardened JavaScript

The native intrinsic reference is captured once at module load, before
any caller can reach the exported functions and before SES lockdown
freezes `Uint8Array`.
Post-lockdown mutation of `Uint8Array` cannot redirect the dispatched
bindings.
