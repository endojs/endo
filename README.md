# Make Importer

This repository is the machinery for creating an EcmaScript Standard Module (ESM)
loader and linker.

It specifically is designed to be the low-level interface to many different kinds of module loading policies.

## Interface

When an importer is created, it has the following API:

```js
/**
 * specifier {string} Module specifier string provided to import
 * referrer {AbsoluteSpecifier} How to find the referrer module
 */
function importer({ specifier, referrer }): Promise<ModuleNamespace>;
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
  //  interface ModuleLinkageRecord extends ModuleStaticRecord {
  //    moduleLocation: ModuleLocation,
  //    moduleLocations: Record<string, ModuleLocation>,
  //  }
  rootLinker, // see below:
  // {
  //  link: (lr: ModuleLinkageRecord, recursiveLink, preEndowments) => ModuleInstance
  //  instanceCache: Map<ModuleLocation, ModuleInstance>,
  //  linkerFor?: (loc: ModuleLocation) => Linker,
  // }
  // ModuleInstance = { getNamespace(): Promise<Record<string, any>> }
});
```

## What per what?

One ModuleLocation per ModuleStaticRecord.

One ModuleLinkageRecord per ModuleLocation (in a given Linker's instanceCache).

Multiple Linkers per Evaluator.  One Evaluator per Linker.

Multiple Importers per Linker.

A Compartment has one Importer.
