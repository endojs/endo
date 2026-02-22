# @endo/immutable-arraybuffer

## [1.1.2](https://github.com/endojs/endo/compare/@endo/immutable-arraybuffer@1.1.1...@endo/immutable-arraybuffer@1.1.2) (2025-07-12)

- Removes `@endo/immutable-arraybufer/shim-hermes.js` and absorbs the necessary features into `@endo/immutable-arraybuffer/shim.js`. We are not qualifying this as a breaking change since the feature did not exist long enough to become relied upon.

## [1.1.1](https://github.com/endojs/endo/compare/@endo/immutable-arraybuffer@1.1.0...@endo/immutable-arraybuffer@1.1.1) (2025-06-17)

- Captures `structuredClone` early so that scuttling all properties of `globalThis`
  after initializing `@endo/immutable-arraybuffer` or
  `@endo/immutable-arraybuffer/shim.js` does not interfere with this module's
  designed behavior.

## [1.1.0](https://github.com/endojs/endo/compare/@endo/immutable-arraybuffer@1.0.0...@endo/immutable-arraybuffer@1.1.0) (2025-06-02)

### Features

* **immutable-arraybuffer:** sliceToImmutable Hermes ponyfill and shim ([dc52bb6](https://github.com/endojs/endo/commit/dc52bb6f027a0a0785095660c0de909c61c40c99))

## 1.0.0 (2025-05-07)

First release.
