# Make Importer

This repository is the machinery for creating an EcmaScript Standard Module (ESM)
loader and linker.

It specifically is designed to be the low-level interface to many different kinds of module loading policies.

## Interface

When an importer is created, it has the following API:

```js
/**
 * spec - Module specifier string provided to import
 * url - referrer URL TODO: referrer?
 */
function importer({ spec, url }): Promise<ModuleNamespace>;
```

## Using

Normally, you would use this module indirectly via another package that sets certain policies before doing its own module loading.

If you want to write such a package, you can use the following interface:

```js
import makeImporter from '@agoric/make-importer';

const importer = makeImporter({
  resolve,    // (specifier: string, referrer: AbsoluteSpecifier) => AbsoluteSpecifier
  locate,     // (absSpecifer: AbsoluteSpecifier) => Promise<ModuleLocation>
  retrieve,   // (loc: ModuleLocation) => Promise<ModuleStaticRecord>
  rootLinker, // see below:
  // {
  //  link: (lr: ModuleLinkageRecord, recursiveLink, preEndowments) => ModuleInstance
  //  instanceCache: Map<LinkageHandle, ModuleInstance>,
  //  linkerFor?: (loc: ModuleLocation) => Linker,
  // }
  // ModuleInstance = { getNamespace(): Promise<Record<string, any>> }
});
```

## What per what?

One ModuleLocation per ModuleStaticRecord.

Multiple LinkageHandle per ModuleStaticRecord.

One ModuleLinkageRecord per LinkageHandle.

Multiple ModuleLinkageRecords per ModuleStaticRecord.

Multiple Linkers per Evaluator.  One Evaluator per Linker.

Multiple Importers per Linker.

A Compartment has one Importer.

## Known Issues

* The word `moduleId` in the sources actually should be a `scopedRef` or `moduleLocation`.

* `export * from 'foo'` is not yet implemented.
