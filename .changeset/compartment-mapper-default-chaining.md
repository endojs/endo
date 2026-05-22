---
'@endo/compartment-mapper': patch
---

Sweep `makeFunctorFromMap` in `bundle.js` and `bundle-lite.js` to use
optional chaining and nullish coalescing for the alias lookup now that
#1514 has completed. The "unable to locate module" diagnostic now
distinguishes the alias-resolved case from the direct-key case, naming
both the alias's resolved key and the original import key when the
miss occurs via an alias.
