# Test-setup rationale

The lib-layer test files (`lib-slice.test.js`, `lib-transfer.test.js`)
install the shim at module top:

```js
import '../src/shim.js';
```

This is necessary because the drop-the-pseudo-prototype redesign moved
the read accessors and prototype methods off the lib's intermediate
prototype and onto `ArrayBuffer.prototype` (via the shim's
`defineProperties` call).
Tests that used to read `iab.byteLength` or
`iab.slice(0)` against the intermediate prototype now reach those same
properties via the shared prototype, which only carries them after the
shim has run.

The lib's free-function helpers (`sliceBufferToImmutable`,
`optTransferBufferToImmutable`) remain importable from the lib module
for tests that want to exercise the free-function call shape directly.
They are also (today) re-exported from `index.js` for pre-shim callers;
the premise-2 follow-up PR will retire the free-function exports from
the package's module surface but not from the lib module itself.

The `shim-amplifier.test.js` and `shim-slice.test.js` / `shim-transfer.test.js`
test files have always installed the shim at module top (their purpose
is to exercise the shim install path); the rationale above does not
apply to them.
