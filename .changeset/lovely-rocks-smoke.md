---
'@endo/error-console-internal': patch
'@endo/errors': patch
'ses': patch
---

unbudle `ses/src/error` into `@endo/error-console-internal`. `@endo/errors` depends on it and `@endo/harden`, not `ses`.
