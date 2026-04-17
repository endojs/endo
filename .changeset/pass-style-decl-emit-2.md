---
'@endo/pass-style': patch
---

Revert the TypeScript declaration for `PASS_STYLE` back to a unique symbol. Compile-time type changes only; no runtime behavior changes.

`PASS_STYLE` is once again typed as a `unique symbol` instead of a string-literal `'Symbol(passStyle)'`. We are working to narrow down the issue and have a more targeted type fix.
