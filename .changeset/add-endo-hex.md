---
'@endo/hex': minor
---

Add `@endo/hex` package providing `encodeHex` and `decodeHex` as a ponyfill for the TC39 `Uint8Array.prototype.toHex` and `Uint8Array.fromHex` intrinsics (proposal-arraybuffer-base64, Stage 4).
Dispatches to the native intrinsics at module load when available, falling through to a portable pure-JavaScript implementation elsewhere.
