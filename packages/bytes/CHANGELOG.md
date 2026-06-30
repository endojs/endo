# Change Log

## 1.0.2

### Patch Changes

- [#3308](https://github.com/endojs/endo/pull/3308) [`4da9a99`](https://github.com/endojs/endo/commit/4da9a9959e4376c5760a3232e978a4f8fe4ac6b7) Thanks [@kriskowal](https://github.com/kriskowal)! - Drop the immutable-ArrayBuffer pseudo-prototype.

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

- Updated dependencies [[`4da9a99`](https://github.com/endojs/endo/commit/4da9a9959e4376c5760a3232e978a4f8fe4ac6b7)]:
  - @endo/immutable-arraybuffer@2.0.0

## 1.0.0

### Major Changes

- [#3257](https://github.com/endojs/endo/pull/3257) [`dd45f4a`](https://github.com/endojs/endo/commit/dd45f4a7ffcf9f8d6fb3aa23a5d22fe00beef8e8) Thanks [@kriskowal](https://github.com/kriskowal)! - Add `@endo/bytes` package providing `concatBytes`, `bytesEqual`, `bytesFromText`, `bytesToText`, `bytesToImmutable`, and `bytesFromImmutable` for platform-neutral byte handling.
  Built on `Uint8Array` with `TextEncoder`/`TextDecoder` captured once at module load.
  `bytesToImmutable` and `bytesFromImmutable` cross between mutable views and the immutable `ArrayBuffer` shape produced by the proposal-immutable-arraybuffer shim, so passable bytes can be carried across vat boundaries.
  Hardened, SES-safe; usable across Node, XS, and browser realms.

  The release is the first publish, going out as `1.0.0` from the `0.1.0` workspace floor (major bump from a `0.x.y` baseline lands at `1.0.0`).

## 0.1.0 (Unreleased)

Initial release.
Portable `Uint8Array` helpers for cross-realm byte handling:
`concatBytes`, `bytesEqual`, `bytesFromText`, `bytesToText`,
`bytesFromImmutable`, `bytesToImmutable`, and `concatImmutables`.
