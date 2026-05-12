---
'@endo/bytes': minor
'@endo/ocapn': patch
---

Add `bytesToImmutable` and `bytesFromImmutable` to `@endo/bytes` for moving between mutable `Uint8Array` views and hardened immutable `ArrayBuffer` instances backed by the proposal-immutable-arraybuffer shim.

`@endo/ocapn` retires its `src/buffer-utils.js` collection of ad-hoc helpers in favor of these and the existing `@endo/bytes` exports plus `decodeHex` from `@endo/hex`, addressing reviewer feedback on the `@endo/bytes` introduction (PR #142, follow-up #223).
