# Make Importer

This repository is the machinery for creating an EcmaScript Standard Module (ESM)
loader and linker.

It specifically is designed to be the low-level interface to many different kinds of module loading policies.

## Interface

When an importer is created, it has the following API:

```js
/**
 * spec - Module specifier string provided to import
 * url - referrer URL
 */
function importer({ spec, url }): Promise<ModuleNamespace>;
```

## Using

Normally, you would use this module indirectly via another package that sets certain policies before doing its own module loading.

If you want to write such a package, you can use the following interface:

```js
import makeImporter from '@agoric/make-importer';

const importer = makeImporter({
  resolve,    // (specifier: string, referrer: ModuleLocation) => ScopedRef
  locate,     // (scopedRef: ScopedRef) => Promise<ModuleLocation>
  retrieve,   // (loc: ModuleLocation) => Promise<string>
  rewrite,    // (body: ModuleSource, loc: ModuleLocation) => ModuleStaticRecord
  rootLinker, // see below:
  // {
  //  link: (lr: ModuleLinkageRecord, recursiveLink, preEndowments) => ModuleInstance
  //  instanceCache: new Map(),
  //  linkerFor?: (loc: ModuleLocation) => Linker,
  // }
  // ModuleInstance = { initialize(): void, }
});
```

## Known Issues

* The word `moduleId` in the sources actually should be a `scopedRef` or `moduleLocation`.

* `export * from 'foo'` is not yet implemented.
