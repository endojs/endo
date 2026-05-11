---
"@endo/zip": patch
---

Remove unused devDependencies on `@endo/eventual-send` and
`@endo/ses-ava`. The package's tests use plain `ava` and
`node:assert` only. Removes two cycle-creating devDep edges per
`designs/break-dev-dependency-cycles.md` Cut 3.
