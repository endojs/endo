---
'@endo/bundle-source': minor
---

`BundleCache.load()` now has a conditional return type based on the `format` option:
- Omitted (default) → `Promise<BundleSourceResult<'endoZipBase64'>>`
- Specific format literal → `Promise<BundleSourceResult<format>>`
- Runtime-typed `ModuleFormat` → `Promise<BundleSourceResult<ModuleFormat>>`

Previously `load()` returned `Promise<unknown>`, requiring callers to assert the bundle shape.
