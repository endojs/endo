---
'@endo/module-source': minor
---

- Transitively freezes the properties of `ModuleSource` constructors and
  instances without requiring lockdown, for greater safety against
  supply-chain-attack.
  `ModuleSource`, particularly through the `@endo/module-source/shim.js`,
  necessarily runs before `lockdown` is called (if ever) and cannot rely on
  `harden`, so must preemptively transitively freeze its properties to be
  a hardened module, regardless of whether `lockdown` is ever called.

