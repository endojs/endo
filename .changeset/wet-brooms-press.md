---
'@endo/compartment-mapper': minor
---

This adds a new option, `additionalLocations`, to `mapNodeModules`. This option enables addition of arbitrary packages to the resulting Compartment Map. It enables execution of packages which need to dynamically load files from Compartments which would otherwise not appear in the map. Specific use-cases include tooling like Webpack and ESLint.
