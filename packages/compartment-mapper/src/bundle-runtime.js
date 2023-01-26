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

/*

NOTES


// we want to approximately create an archive compartmentMap with functors
// and then link the compartmentMap into an application via a custom importHook that uses getFunctor

// link turns a compartmentMap (CompartmentDescriptors) into an application (Compartments)
// - actual module sources are loaded via `get`
//   -> get could be replaced with getFunctor <----------------------
// - makeArchiveImportHookMaker/importHook creates the records via the parser and `get` and `compartmentMap`
//   -> can call getFunctor and put it on the record
// - parser creates a functor via compartment.evaluate
//   -> could provide custom compartments that when evaluate is called refer to a precompile
//   -> parser could pull module functor off of compartment

// can make an alternate parser for language that pulls the functors out from somewhere


application.execute
  ses/src/compartment-shim import
    ses/src/module-load load
      memoizedLoadWithErrorAnnotation
        loadWithoutErrorAnnotation
          importHook (via makeArchiveImportHookMaker) returns { record, specifier: moduleSpecifier } as staticModuleRecord
            parse (via parserForLanguage) returns { record }
          loadRecord assumes record is an alias, returns moduleRecord wrapping record
    compartmentImportNow
      ses/src/module-link link()
        ses/src/module-link instantiate()
          if(isPrecompiled)
            makeModuleInstance  <-- COULD call our functor
              compartmentEvaluate
          else
            makeThirdPartyModuleInstance
              staticModuleRecord.execute <-- calls our execute


  moduleRecord <- from loadRecord
    staticModuleRecord <- from importHook
      record <- from parserForLanguage[language].parse

if(isPrecompiled)
  makeModuleInstance
    sets execute: __syncModuleFunctor__
else
  makeThirdPartyModuleInstance
    sets execute: staticModuleRecord.execute
      execute (via parserForLanguage) from parse-pre-cjs.js

>>>>>>>>> questions

import-archive always invokes module record aliases - is this intentional?

makeModuleInstance + makeThirdPartyModuleInstance
  dont rhyme as much as I'd like


*/
