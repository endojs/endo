// @ts-check
/** @typedef {import('ses').RedirectStaticModuleInterface} RedirectStaticModuleInterface */
/** @typedef {import('./types.js').ExecuteFn} ExecuteFn */

/* globals globalThis */
import { link } from './link.js';
import { makeArchiveImportHookMaker } from './import-archive.js';

const textEncoder = new TextEncoder();

export function loadApplication(compartmentMap, lookupModule, archiveLocation) {
  const lookupAndReserializeModule = async moduleLocation =>
    textEncoder.encode(JSON.stringify(await lookupModule(moduleLocation)));

  const {
    compartments: compartmentDescriptors,
    entry: { module: entrySpecifier },
  } = compartmentMap;

  const archiveMakeImportHook = makeArchiveImportHookMaker(
    lookupAndReserializeModule, // <-- this is our get function
    compartmentDescriptors,
    archiveLocation,
  );

  const { compartment: entryCompartment, compartments } = link(compartmentMap, {
    makeImportHook: archiveMakeImportHook,
    globals: globalThis,
    // transforms,
  });

  /** @type {ExecuteFn} */
  const execute = () => {
    // eslint-disable-next-line dot-notation
    return entryCompartment['import'](entrySpecifier);
  };

  return { execute, compartments };
}
