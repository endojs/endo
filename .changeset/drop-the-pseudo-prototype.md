---
'@endo/immutable-arraybuffer': major
'ses': minor
'@endo/pass-style': patch
'@endo/bytes': patch
---

Drop the immutable-ArrayBuffer pseudo-prototype.

Emulated immutable `ArrayBuffer`s produced by
`@endo/immutable-arraybuffer` now inherit directly from
`ArrayBuffer.prototype` rather than from an intermediate prototype.
`Object.getPrototypeOf(immuAB) === ArrayBuffer.prototype` for both
emulated immutable and genuine buffers; the brand check is the new
`immutable` accessor on `ArrayBuffer.prototype` installed by the shim.

The `[Symbol.toStringTag]` slot is preserved as an own property on each
emulated immutable buffer (not on the shared prototype), so
`Object.prototype.toString.call(immuAB)` continues to return
`'[object ImmutableArrayBuffer]'` (as in master) while genuine
ArrayBuffers continue to read as `'[object ArrayBuffer]'`. This keeps
`concordance` (and any other downstream consumer that sniffs the
toStringTag to decide whether the value is a genuine exotic) from
misrouting an emulated immutable through Node's `Buffer.from`, which
throws because the emulated immutable is not an exotic object.

`@endo/immutable-arraybuffer` is now a side-effect-only package: its
sole public export is `./shim.js`. The `index.js` and the package's
`.` entry are removed; the previously exported names
(`isBufferImmutable`, `sliceBufferToImmutable`,
`optTransferBufferToImmutable`) are no longer reachable from outside
the package. Callers detect immutability via the
`ArrayBuffer.prototype.immutable` accessor (or
`Object.prototype.toString.call(buffer) === '[object ImmutableArrayBuffer]'`
when the shim has not been loaded) and convert via
`buffer.sliceToImmutable(...)` and `buffer.transferToImmutable(...)`
on the prototype. The break is a major bump for the
`@endo/immutable-arraybuffer` package.

`@endo/bytes`'s `to-immutable.js` imports `@endo/immutable-arraybuffer/shim.js`
(triggering the shim install) and calls `buffer.sliceToImmutable(...)`
on `ArrayBuffer.prototype` instead of the previously exported
`sliceBufferToImmutable` free function.

The shim's install policy is now detect-then-skip rather than
warn-and-overwrite: the Immutable ArrayBuffer proposal has reached
stage 3, so any prior installation (native or previously loaded shim)
wins. If `'sliceToImmutable' in ArrayBuffer.prototype` is already
true when the shim loads, the shim does nothing.

`ses` drops the `%ImmutableArrayBufferPrototype%` permits entry, which
no longer has a referent. The three permits lines inside
`%ArrayBufferPrototype%` that declare the shim-installed methods
(`transferToImmutable`, `sliceToImmutable`, `immutable`) stay as-is.

`@endo/pass-style`'s `byteArray` brand check no longer routes through
an intermediate prototype; it consults the `immutable` accessor on
`ArrayBuffer.prototype` directly. The check also tolerates the
`[Symbol.toStringTag]` own-property on emulated immutable buffers and
verifies that its value is a non-enumerable data property with a string
value.
