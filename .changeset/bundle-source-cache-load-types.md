---
'@endo/bundle-source': minor
---

`BundleCache.load()` is now generic on the `format` option:
- Omitted (default) → `Promise<BundleSourceResult<'endoZipBase64'>>`
- Literal format → `Promise<BundleSourceResult<format>>`
- Runtime-typed `ModuleFormat` → `Promise<BundleSourceResult<ModuleFormat>>`

Previously `load()` returned `Promise<unknown>`, requiring callers to assert the bundle shape.
