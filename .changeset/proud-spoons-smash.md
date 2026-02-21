---
'@endo/module-source': minor
---

- Harden `ModuleSource` constructor and instances under lockdown for greater
  safety against supply-chain-attack.
- Consumers of `ModuleSource` (including via `@endo/compartment-mapper` or
  `@endo/bundle-source`) should ensure these tools are imported after
  `lockdown()`, since hardened modules using `@endo/harden` have a mechanism
  that protects them from being left unhardened if they are inadvertently
  imported before lockdown has been arranged.
