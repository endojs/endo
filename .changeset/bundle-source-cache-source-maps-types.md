---
'@endo/bundle-source': patch
---

Update `BundleOptions` and the `powers` parameter types to reflect what
`bundleSource` already accepts at runtime: `cacheSourceMaps` is now
documented on `BundleOptions`, `commonDependencies` and `importHook`
(only for the `endoZipBase64` format) are surfaced, and the optional
`powers` parameter accepts the wider `BundlePowers` shape (including
`pathResolve`, `userInfo`, `env`, `platform`, and `computeSha512`).
This is a JSDoc/typings-only change; no runtime behavior changes.
