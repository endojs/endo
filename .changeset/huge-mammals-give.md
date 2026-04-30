---
'@endo/compartment-mapper': patch
---

Fixes `CompartmentDescriptor` so that it is generic on the `PackagePolicy`; externally-defined `ParseFn`s can now refer to the specific contents of a custom `PackagePolicy` present in a `CompartmentDescriptor`.

Introduces `ParseSourceMapHook`; differentiated from `@endo/module-source`'s `SourceMapHook`.

Fixes type of `PolicyItem`; eliminates confusion between `void` (no extra union members) and `any` (`SomePackagePolicy`).
