---
'ses': minor
---

- `lockdown` and `repairIntrinsics` now detect if a hardened module (using
  `@endo/harden`) ran before lockdown and fail with a clear error about hardened
  modules executing before lockdown.
- Adds `Object[Symbol.for('harden')]` as a variant of `globalThis.harden` that
  cannot be overridden by an endowment named `harden` in compartments.
