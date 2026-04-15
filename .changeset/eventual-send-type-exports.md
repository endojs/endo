---
'@endo/eventual-send': minor
---

Improve `E()` type inference and publicly export method-projection helpers.

- `RemoteFunctions`, `PickCallable`, and `ECallableOrMethods` now short-circuit on `any`, preventing `E(anyValue)` from collapsing to an unusable type.
- `EMethods`, `EGetters`, and related helpers are now part of the public type surface, so downstream packages can name the projected shapes `E()` produces.

Compile-time type changes only; no runtime behavior changes.
