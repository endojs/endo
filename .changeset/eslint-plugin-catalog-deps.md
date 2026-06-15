---
'@endo/eslint-plugin': patch
---

Republish with resolved dependency versions. The 2.6.0 manifest on npm
shipped `catalog:` protocol specifiers for `eslint-plugin-import` and
`typescript`, which npm cannot resolve; the publish toolchain now resolves
the `catalog:` protocol to concrete version ranges at pack time. Fixes
https://github.com/endojs/endo/issues/3304.
