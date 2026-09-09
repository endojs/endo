# bad package names

This fixture contains packages matching the entry compartment name and the attenuators compartment name, both of which have special meaning in the compartment mapper.

This sort of occurrence is assumed to only be possible after manual editing of `package.json`, as the npm registry considers either of these names to be invalid.

Such packages should not be allowed to be created by `mapNodeModules`.

- `app` / `your-package` - matches the entry compartment name
- `app2` / `a-package` - matches the attenuators compartment name
