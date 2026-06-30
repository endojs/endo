---
'@endo/bytes': patch
---

Make the `@endo/bytes` operators tolerate every `Uint8Array` variant —
native or emulated, frozen or mutable.

When a `Uint8Array` is constructed over an emulated immutable `ArrayBuffer`
(the `@endo/immutable-arraybuffer` shim on a platform without native support),
the result is a plain object that `ArrayBuffer.isView` rejects: integer
indexing reads `undefined`, and platform APIs such as `TextDecoder.decode` and
`TypedArray.prototype.set` either throw or silently read zeros. `bytesToText`,
`bytesEqual`, and `concatBytes` now copy such an emulated wrapper to a genuine
`Uint8Array` before any platform call or indexing — the wrapper's native
`slice` memcopies from the hidden genuine TypedArray it amplifies to, rather
than `result.set(wrapper)`, which would read zeros because the wrapper exposes
no integer-indexed own properties. This is a hidden performance cost on the
emulated path that lets these ponyfills function identically across variants.
Genuine views are passed through uncopied, so the common path is unaffected.
