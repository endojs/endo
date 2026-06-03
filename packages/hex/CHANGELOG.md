# @endo/hex

## 1.1.0

### Minor Changes

- [#3208](https://github.com/endojs/endo/pull/3208) [`ad7a177`](https://github.com/endojs/endo/commit/ad7a177e84b08c74526ceb9b0ea15f3c81c06158) Thanks [@kriskowal](https://github.com/kriskowal)! - Add `@endo/hex` package providing `encodeHex` and `decodeHex` as a ponyfill for the TC39 `Uint8Array.prototype.toHex` and `Uint8Array.fromHex` intrinsics (proposal-arraybuffer-base64, Stage 4).
  Dispatches to the native intrinsics at module load when available, falling through to a portable pure-JavaScript implementation elsewhere.
