This fixture is for testing the behavior of `mapNodeModules()` when a package has no declared `peerDependencies` _but_ has a `peerDependenciesMeta` field listing an _optional_ dependency.

The _intent_ of this configuration is to declare _optional_ peer dependencies.  

`npm@7+` requires all dependencies mentioned in `peerDependenciesMeta` must to be declared in `peerDependencies`. This enables automatic installation of the peer dependencies (which is then allowed to fail).

Prior to `npm@7`, there was no way to declare a peer dependency as optional, leading packages to _omit_ optional `peerDependencies` from `package.json`.  

I do not know if `yarn` or `pnpm` (any version) do anything with a lone `peerDependenciesMeta` field. Assuming they don't, `peerDependenciesMeta` w/o a `peerDependencies` is little more than a _hint_ to a human reader.
