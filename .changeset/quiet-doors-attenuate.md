---
'@endo/compartment-mapper': patch
---

Fixed an issue where an exit module (such as a Node.js builtin) loaded by a dynamic `require()` was not attenuated per `builtins` policy, so the requiring package received the whole module. Exit modules provided in the `modules` option can now also be loaded by a dynamic `require()`.
