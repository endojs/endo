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
  resolve,    // (specifier: string, referrer: AbsoluteSpecifier) => AbsoluteSpecifier // cached
  locate,     // (absSpecifer: AbsoluteSpecifier) => Promise<ModuleLocation> // cached
  retrieve,   // (loc: ModuleLocation) => Promise<ResourceStream> // (not cached)
  analyze,    // (rs: ResourceStream) => Promise<ModuleStaticRecord> // cached by ModuleLocation
  rootLinker, // see below:
  // {
  //  link: (lr: ModuleLinkageRecord, recursiveLink, preEndowments) => ModuleInstance
  //  instanceCache: Map<LinkageHandle, ModuleInstance>,
  //  linkerFor?: (loc: ModuleLocation) => Linker,
  // }
  // ModuleInstance = { getNamespace(): Promise<Record<string, any>> }
});
```

TODO: Remove `source` from ModuleStaticRecord, as not all modules will have a textual source, and we can debug it elsewhere.

## What per what?

One ModuleLocation per ModuleStaticRecord.

Multiple LinkageHandle per ModuleStaticRecord.

One ModuleLinkageRecord per LinkageHandle.

Multiple ModuleLinkageRecords per ModuleStaticRecord.

Multiple Linkers per Evaluator.  One Evaluator per Linker.

Multiple Importers per Linker.

A Compartment has one Importer.
