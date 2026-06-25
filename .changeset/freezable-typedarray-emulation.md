---
'@endo/immutable-arraybuffer': minor
'@endo/pass-style': minor
'ses': patch
---

Add freezable TypedArray emulation for immutable-ArrayBuffer-backed views.

After loading `@endo/immutable-arraybuffer/shim.js`, constructing a TypedArray
from an emulated immutable `ArrayBuffer` produces an emulated freezable wrapper
whose mutator methods (`copyWithin`, `fill`, `reverse`, `set`, `sort`) throw
`TypeError`, whose `buffer` getter returns the immutable wrapper rather than
the underlying genuine buffer, and which can be frozen via `Object.freeze`.
The wrapper inherits directly from `T.prototype` with no intermediate prototype.

The genuine-buffer constructor path (passing a regular mutable `ArrayBuffer`)
is unchanged: the result is a normal writable TypedArray view.

`@endo/pass-style`: a plain frozen `Uint8Array` backed by an immutable
`ArrayBuffer` is now recognized as a passable `byteArray`, alongside an
immutable `ArrayBuffer` itself. `passStyleOf` also reports a clear
`Cannot pass mutable typed arrays` diagnostic for a mutable TypedArray rather
than the generic non-remotable error.

`ses`: the permits walk accepts the shim-installed `%TypedArrayPrototype%`
slots without complaint; no new permit rows are required.
