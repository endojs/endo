---
"@endo/compartment-mapper": patch
---

- Introduces additional signal to consider an export from a package an ESM module when it's selected via an `import` key in `exports` in package.json in case no other indication of it being an ESM module is present.
