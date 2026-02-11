---
'@endo/compartment-mapper': major
---

- **Breaking:** `CompartmentMapDescriptor` no longer has a `path` property.
- **Breaking:** `CompartmentMapDescriptor`'s `label` property is now a
  _canonical name_ (a string of one or more npm package names separated by `>`).
- **Breaking:** The `CompartmentMapDescriptor` returned by `captureFromMap()`
  now uses canonical names as the keys in its `compartments` property.
- Breaking types: `CompartmentMapDescriptor`, `CompartmentDescriptor`,
  `ModuleConfiguration` (renamed from `ModuleDescriptor`) and `ModuleSource`
  have all been narrowed into discrete subtypes.
- `captureFromMap()`, `loadLocation()` and `importLocation()` now accept a
  `moduleSourceHook` option. This hook is called when processing each module
  source, receiving the module source data (location, language, bytes, or error
  information) and the canonical name of the containing package.
- `captureFromMap()` now accepts a `packageConnectionsHook` option. This hook is
  called for each retained compartment with its canonical name and the set of
  canonical names of compartments it links to (its connections). Useful for
  analyzing or visualizing the dependency graph.
- `mapNodeModules()`, `loadLocation()`, `importLocation()`, `makeScript()`,
  `makeFunctor()`, and `writeScript()` now accept the following hook options:
  - `unknownCanonicalNameHook`: Called for each canonical name mentioned in
    policy but not found in the compartment map. Useful for detecting policy
    misconfigurations.
  - `packageDependenciesHook`: Called for each package with its set of
    dependencies. Can return partial updates to modify the dependencies,
    enabling dependency filtering or injection based on policy.
  - `packageDataHook`: Called once with data about all packages found while
    crawling `node_modules`, just prior to creation of a compartment map.
- When dynamic requires are enabled via configuration, execution now takes
  policy into consideration when no other relationship (for example, a
  dependent/dependee relationship) between two Compartments exists. When policy
  explicitly allows access from package _A_ to _B_ and _A_ dynamically requires
  _B_ (via absolute path or otherwise), the operation will succeed. This can
  occur _if and only if_ dynamic requires are enabled _and_ a policy is
  provided.
- Improved error messaging for policy enforcement failures.
