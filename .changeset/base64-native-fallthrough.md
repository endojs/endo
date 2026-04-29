---
'@endo/base64': patch
---

`encodeBase64` and `decodeBase64` now dispatch to the native
`Uint8Array.prototype.toBase64` and `Uint8Array.fromBase64` intrinsics (TC39
proposal-arraybuffer-base64, Stage 4) on platforms that ship them, falling back
to the existing pure-JavaScript implementation otherwise.
Existing call sites pick up the speedup with no API change, and `decodeBase64`'s
error messages (including any caller-supplied `name` and the failing offset) are
unchanged.
