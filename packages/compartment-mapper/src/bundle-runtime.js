// @ts-check
/** @typedef {import('ses').RedirectStaticModuleInterface} RedirectStaticModuleInterface */
/** @typedef {import('./types.js').ExecuteFn} ExecuteFn */

/* globals globalThis */
import { scopeTerminators } from 'ses/tools.js';
import { link } from './link.js';
import { makeArchiveImportHookMaker } from './import-archive.js';

const { strictScopeTerminator } = scopeTerminators;
const textEncoder = new TextEncoder();

export function loadApplication(
  compartmentMap,
  moduleRegistry,
  loadModuleFunctors,
  archiveLocation,
) {
  const lookupModule = moduleLocation =>
    textEncoder.encode(JSON.stringify(moduleRegistry[moduleLocation]));

  const {
    compartments: compartmentDescriptors,
    entry: { module: entrySpecifier },
  } = compartmentMap;

  const archiveMakeImportHook = makeArchiveImportHookMaker(
    lookupModule, // <-- this is our get function
    compartmentDescriptors,
    archiveLocation,
  );

  // see getEvalKitForCompartment definition for note on hoisting
  /* eslint-disable-next-line no-use-before-define */
  const moduleFunctors = loadModuleFunctors(getEvalKitForCompartment);

  const makeImportHook = (packageLocation, packageName) => {
    const archiveImportHook = archiveMakeImportHook(
      packageLocation,
      packageName,
    );
    const { modules: moduleDescriptors } =
      compartmentDescriptors[packageLocation];
    const importHook = async moduleSpecifier => {
      const staticModuleRecord = await archiveImportHook(moduleSpecifier);
      // archiveImportHook always setups on an alias record
      // loadRecord will read the alias so use that
      const aliasModuleRecord = /** @type {RedirectStaticModuleInterface} */ (
        staticModuleRecord
      ).record;
      // put module functor on the staticModuleRecord
      const moduleDescriptor = moduleDescriptors[moduleSpecifier];
      const moduleLocation = `${packageLocation}/${moduleDescriptor.location}`;
      const makeModuleFunctor = moduleFunctors[moduleLocation];
      /* eslint-disable-next-line no-underscore-dangle */
      /** @type {any} */ (aliasModuleRecord).__syncModuleFunctor__ =
        makeModuleFunctor();
      return staticModuleRecord;
    };
    return importHook;
  };

  /*
  wiring would be cleaner if `link()` could take a compartments collection

  reference cycle:
    - `getEvalKitForCompartment` needs `compartments`
    - `compartments` is created by `link()`
    - `link()` needs `makeImportHook`
    - `makeImportHook` needs `getEvalKitForCompartment`
  */
  const { compartment: entryCompartment, compartments } = link(compartmentMap, {
    makeImportHook,
    globals: globalThis,
    // transforms,
  });

  function getCompartmentByName(name) {
    let compartment = compartments[name];
    if (compartment === undefined) {
      compartment = new Compartment();
      compartments[name] = compartment;
    }
    return compartment;
  }

  // this relies on hoisting to close a reference triangle
  // as noted above, this could be fixed if we could pass `compartments` into `link()`
  function getEvalKitForCompartment(compartmentName) {
    const compartment = getCompartmentByName(compartmentName);
    const scopeTerminator = strictScopeTerminator;
    const { globalThis } = compartment;
    return { globalThis, scopeTerminator };
  }

  /** @type {ExecuteFn} */
  const execute = () => {
    // eslint-disable-next-line dot-notation
    return entryCompartment['import'](entrySpecifier);
  };

  return { execute, compartments };
}
