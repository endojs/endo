// @ts-check
/* eslint no-shadow: 0 */

/** @import {ArchiveOptions} from './types.js' */
/** @import {CompartmentDescriptor} from './types.js' */
/** @import {CompartmentSources} from './types.js' */
/** @import {MaybeReadPowers} from './types.js' */
/** @import {PrecompiledStaticModuleInterface} from 'ses' */
/** @import {ReadFn} from './types.js' */
/** @import {ReadPowers} from './types.js' */
/** @import {Sources} from './types.js' */
/** @import {WriteFn} from './types.js' */

import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { unpackReadPowers } from './powers.js';
import { makeImportHookMaker } from './import-hook.js';
import { defaultParserForLanguage } from './archive-parsers.js';
import { parseLocatedJson } from './json.js';

import mjsSupport from './bundle-mjs.js';
import cjsSupport from './bundle-cjs.js';

const textEncoder = new TextEncoder();

const { quote: q } = assert;

/**
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @param {Record<string, CompartmentSources>} compartmentSources
 * @param {string} entryCompartmentName
 * @param {string} entryModuleSpecifier
 */
const sortedModules = (
  compartmentDescriptors,
  compartmentSources,
  entryCompartmentName,
  entryModuleSpecifier,
) => {
  const modules = [];
  const aliases = new Map();
  const seen = new Set();

  /**
   * @param {string} compartmentName
   * @param {string} moduleSpecifier
   */
  const recur = (compartmentName, moduleSpecifier) => {
    const key = `${compartmentName}#${moduleSpecifier}`;
    if (seen.has(key)) {
      return key;
    }
    seen.add(key);

    const source = compartmentSources[compartmentName][moduleSpecifier];
    if (source !== undefined) {
      const { record, parser, deferredError } = source;
      if (deferredError) {
        throw Error(
          `Cannot bundle: encountered deferredError ${deferredError}`,
        );
      }
      if (record) {
        const { imports = [], reexports = [] } =
          /** @type {PrecompiledStaticModuleInterface} */ (record);
        const resolvedImports = Object.create(null);
        for (const importSpecifier of [...imports, ...reexports]) {
          // If we ever support another module resolution algorithm, that
          // should be indicated in the compartment descriptor by name and the
          // corresponding behavior selected here.
          const resolvedSpecifier = resolve(importSpecifier, moduleSpecifier);
          resolvedImports[importSpecifier] = recur(
            compartmentName,
            resolvedSpecifier,
          );
        }

        modules.push({
          key,
          compartmentName,
          moduleSpecifier,
          parser,
          record,
          resolvedImports,
        });

        return key;
      }
    } else {
      const descriptor =
        compartmentDescriptors[compartmentName].modules[moduleSpecifier];
      if (descriptor) {
        const {
          compartment: aliasCompartmentName,
          module: aliasModuleSpecifier,
        } = descriptor;
        if (
          aliasCompartmentName !== undefined &&
          aliasModuleSpecifier !== undefined
        ) {
          const aliasKey = recur(aliasCompartmentName, aliasModuleSpecifier);
          aliases.set(key, aliasKey);
          return aliasKey;
        }
      }
    }

    throw Error(
      `Cannot bundle: cannot follow module import ${moduleSpecifier} in compartment ${compartmentName}`,
    );
  };

  recur(entryCompartmentName, entryModuleSpecifier);

  return { modules, aliases };
};

const implementationPerParser = {
  'pre-mjs-json': mjsSupport,
  'pre-cjs-json': cjsSupport,
};

function getRuntime(parser) {
  return implementationPerParser[parser]
    ? implementationPerParser[parser].runtime
    : `/*unknown parser:${parser}*/`;
}

function getBundlerKitForModule(module) {
  const parser = module.parser;
  if (!implementationPerParser[parser]) {
    const warning = `/*unknown parser:${parser}*/`;
    // each item is a function to avoid creating more in-memory copies of the source text etc.
    return {
      getFunctor: () => `(()=>{${warning}})`,
      getCells: `{${warning}}`,
      getFunctorCall: warning,
    };
  }
  const { getBundlerKit } = implementationPerParser[parser];
  return getBundlerKit(module);
}

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 * @returns {Promise<string>}
 */
export const makeBundle = async (readPowers, moduleLocation, options) => {
  const { read, maybeRead } = unpackReadPowers(readPowers);

  const {
    moduleTransforms,
    dev,
    tags: tagsOption,
    searchSuffixes,
    commonDependencies,
    sourceMapHook = undefined,
    parserForLanguage: parserForLanguageOption = {},
    languageForExtension: languageForExtensionOption = {},
  } = options || {};
  const tags = new Set(tagsOption);

  const parserForLanguage = Object.freeze(
    Object.assign(
      Object.create(null),
      defaultParserForLanguage,
      parserForLanguageOption,
    ),
  );
  const languageForExtension = Object.freeze(
    Object.assign(Object.create(null), languageForExtensionOption),
  );

  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(maybeRead, moduleLocation);

  const packageDescriptor = parseLocatedJson(
    packageDescriptorText,
    packageDescriptorLocation,
  );
  const compartmentMap = await compartmentMapForNodeModules(
    read,
    packageLocation,
    tags,
    packageDescriptor,
    moduleSpecifier,
    { dev, commonDependencies },
  );

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {Sources} */
  const sources = Object.create(null);

  const makeImportHook = makeImportHookMaker(read, packageLocation, {
    sources,
    compartmentDescriptors: compartments,
    searchSuffixes,
    entryCompartmentName,
    entryModuleSpecifier,
    sourceMapHook,
  });

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
    languageForExtension,
  });
  await compartment.load(entryModuleSpecifier);

  const { modules, aliases } = sortedModules(
    compartmentMap.compartments,
    sources,
    entryCompartmentName,
    entryModuleSpecifier,
  );

  // Create an index of modules so we can resolve import specifiers to the
  // index of the corresponding functor.
  const modulesByKey = Object.create(null);
  for (let index = 0; index < modules.length; index += 1) {
    const module = modules[index];
    module.index = index;
    modulesByKey[module.key] = module;
  }
  const parsersInUse = new Set();
  for (const module of modules) {
    module.indexedImports = Object.fromEntries(
      Object.entries(module.resolvedImports).map(([importSpecifier, key]) => {
        // UNTIL https://github.com/endojs/endo/issues/1514
        // Prefer: key = aliases.get(key) ?? key;
        const alias = aliases.get(key);
        if (alias != null) {
          key = alias;
        }
        const module = modulesByKey[key];
        if (module === undefined) {
          throw new Error(
            `Unable to locate module for key ${q(key)} import specifier ${q(
              importSpecifier,
            )} in ${q(module.moduleSpecifier)} of compartment ${q(
              module.compartmentName,
            )}`,
          );
        }
        const { index } = module;
        return [importSpecifier, index];
      }),
    );
    parsersInUse.add(module.parser);
    module.bundlerKit = getBundlerKitForModule(module);
  }

  const bundle = `\
'use strict';
(() => {
  const functors = [
${''.concat(...modules.map(m => m.bundlerKit.getFunctor()))}\
]; // functors end

  const cell = (name, value = undefined) => {
    const observers = [];
    return Object.freeze({
      get: Object.freeze(() => {
        return value;
      }),
      set: Object.freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: Object.freeze((observe) => {
        observers.push(observe);
        observe(value);
      }),
      enumerable: true,
    });
  };

  const cells = [
${''.concat(...modules.map(m => m.bundlerKit.getCells()))}\
  ];

${''.concat(...modules.map(m => m.bundlerKit.getReexportsWiring()))}\

const namespaces = cells.map(cells => Object.freeze(Object.create(null, {
    ...cells,
    // Make this appear like an ESM module namespace object.
    [Symbol.toStringTag]: {
      value: 'Module',
      writable: false,
      enumerable: false,
      configurable: false,
    },
  })));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

${''.concat(...Array.from(parsersInUse).map(parser => getRuntime(parser)))}

${''.concat(...modules.map(m => m.bundlerKit.getFunctorCall()))}\

  return cells[cells.length - 1]['*'].get();
})();
`;

  return bundle;
};

/**
 * @param {WriteFn} write
 * @param {ReadFn} read
 * @param {string} bundleLocation
 * @param {string} moduleLocation
 * @param {ArchiveOptions} [options]
 */
export const writeBundle = async (
  write,
  read,
  bundleLocation,
  moduleLocation,
  options,
) => {
  const bundleString = await makeBundle(read, moduleLocation, options);
  const bundleBytes = textEncoder.encode(bundleString);
  await write(bundleLocation, bundleBytes);
};
