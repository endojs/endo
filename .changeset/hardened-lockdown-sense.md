---
'ses': minor
---

- `lockdown` and `repairIntrinsics` now detect when code has already called a
  `harden` imported from `@endo/harden` before lockdown, and fail with a clear
  error about hardened modules executing before lockdown.
- Adds `Object[Symbol.for('harden')]` as a variant of `globalThis.harden` that
  cannot be overridden by an endowment named `harden` in compartments.
