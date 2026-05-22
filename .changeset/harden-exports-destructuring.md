---
'@endo/eslint-plugin': patch
---

`harden-exports` now collects export names from all binding pattern shapes
that may appear on the left-hand side of `export const ... = ...`:
aliased object destructuring (`{ propName: aliasName }`), object and array
rest, nested patterns, sparse holes, and default-value assignment patterns.
A new `unknownBindingPattern` report surfaces any pattern type the helper
does not recognize, in place of silent passthrough.
