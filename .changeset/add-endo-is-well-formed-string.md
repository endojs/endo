---
'@endo/is-well-formed-string': minor
'@endo/pass-style': patch
---

Add `@endo/is-well-formed-string`, a shared ponyfill for
`String.prototype.isWellFormed` that reports whether a value is a well-formed
Unicode string (no unpaired surrogates), preferring the engine-native method when
present and falling back to a manual surrogate scan otherwise (XS, which runs the
slot-machine bus worker, may lack the built-in). It returns `false` for every
non-string, unlike the coercing native method.

The check previously lived inside `@endo/pass-style`; it is factored out here so
primitive codecs such as `@endo/cbor` can depend on the well-formedness check
without entraining the whole pass-style package, with a single canonical
implementation. `@endo/pass-style` now re-exports `isWellFormedString` from this
package; its public API and hardening are unchanged.
