// @ts-check
/* eslint no-shadow: 0 */

/** @typedef {import('ses').ResolveHook} ResolveHook */
/** @typedef {import('ses').PrecompiledStaticModuleInterface} PrecompiledStaticModuleInterface */
/** @typedef {import('./types.js').ParserImplementation} ParserImplementation */
/** @typedef {import('./types.js').CompartmentDescriptor} CompartmentDescriptor */
/** @typedef {import('./types.js').CompartmentSources} CompartmentSources */
/** @typedef {import('./types.js').ReadFn} ReadFn */
/** @typedef {import('./types.js').ModuleTransforms} ModuleTransforms */
/** @typedef {import('./types.js').Sources} Sources */
/** @typedef {import('./types.js').WriteFn} WriteFn */
/** @typedef {import('./types.js').ArchiveOptions} ArchiveOptions */

import { resolve } from './node-module-specifier.js';
import { compartmentMapForNodeModules } from './node-modules.js';
import { search } from './search.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';
import { parseLocatedJson } from './json.js';

const textEncoder = new TextEncoder();

/** quotes strings */
const q = JSON.stringify;

/** @type {Record<string, ParserImplementation>} */
const parserForLanguage = {
  mjs: parserArchiveMjs,
  'pre-mjs-json': parserArchiveMjs,
  cjs: parserArchiveCjs,
  'pre-cjs-json': parserArchiveCjs,
  json: parserJson,
  text: parserText,
  bytes: parserBytes,
};

function adaptReexport(reexportMap) {
  if (!reexportMap) {
    return {};
  }
  const ret = Object.fromEntries(
    Object.values(reexportMap)
      .flat()
      .map(([local, exported]) => [exported, [local]]),
  );
  return ret;
}

/**
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @param {Record<string, CompartmentSources>} compartmentSources
 * @param {Record<string, ResolveHook>} compartmentResolvers
 * @param {string} entryCompartmentName
 * @param {string} entryModuleSpecifier
 */
const sortedModules = (
  compartmentDescriptors,
  compartmentSources,
  compartmentResolvers,
  entryCompartmentName,
  entryModuleSpecifier,
) => {
  const modules = [];
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

    const resolve = compartmentResolvers[compartmentName];
    const source = compartmentSources[compartmentName][moduleSpecifier];
    if (source) {
      const { record, parser } = source;
      if (record) {
        const { imports = [], reexports = [] } =
          /** @type {PrecompiledStaticModuleInterface} */ (record);
        const resolvedImports = Object.create(null);
        for (const importSpecifier of [...imports, ...reexports]) {
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
          return recur(aliasCompartmentName, aliasModuleSpecifier);
        }
      }
    }

    throw new Error(
      `Cannot bundle: cannot follow module import ${moduleSpecifier} in compartment ${compartmentName}`,
    );
  };

  recur(entryCompartmentName, entryModuleSpecifier);

  return modules;
};

/**
 * @param {ReadFn} read
 * @param {string} moduleLocation
 * @param {Object} [options]
 * @param {ModuleTransforms} [options.moduleTransforms]
 * @param {boolean} [options.dev]
 * @returns {Promise<string>}
 */
export const makeBundle = async (read, moduleLocation, options) => {
  const { moduleTransforms, dev } = options || {};
  const {
    packageLocation,
    packageDescriptorText,
    packageDescriptorLocation,
    moduleSpecifier,
  } = await search(read, moduleLocation);

  /** @type {Set<string>} */
  const tags = new Set();

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
    { dev },
  );

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {Sources} */
  const sources = Object.create(null);

  const makeImportHook = makeImportHookMaker(
    read,
    packageLocation,
    sources,
    compartments,
  );

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment, resolvers } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    parserForLanguage,
  });
  await compartment.load(entryModuleSpecifier);

  const modules = sortedModules(
    compartmentMap.compartments,
    sources,
    resolvers,
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
  for (const module of modules) {
    module.indexedImports = Object.fromEntries(
      Object.entries(module.resolvedImports).map(([importSpecifier, key]) => [
        importSpecifier,
        modulesByKey[key].index,
      ]),
    );
  }

  // Only support mjs format.
  const problems = modules
    .filter(module => module.parser !== 'pre-mjs-json')
    .map(
      ({ moduleSpecifier, compartmentName, parser }) =>
        `module ${moduleSpecifier} in compartment ${compartmentName} in language ${parser}`,
    );
  if (problems.length) {
    throw new Error(
      `Can only bundle applications that only have ESM (.mjs-type) modules, got ${problems.join(
        ', ',
      )}`,
    );
  }

  const exportsCellRecord = exportMap =>
    ''.concat(
      ...Object.keys(exportMap).map(
        exportName => `\
      ${exportName}: cell(${q(exportName)}),
`,
      ),
    );
  const importsCellSetter = (exportMap, index) =>
    ''.concat(
      ...Object.entries(exportMap).map(
        ([exportName, [importName]]) => `\
      ${importName}: cells[${index}].${exportName}.set,
`,
      ),
    );

  const bundle = `\
'use strict';
(() => {
  const functors = [
${''.concat(
  ...modules.map(
    ({ record: { __syncModuleProgram__ } }, i) =>
      `\
// === functors[${i}] ===
${__syncModuleProgram__},
`,
  ),
)}\
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
${''.concat(
  ...modules.map(
    ({
      record: { __fixedExportMap__, __liveExportMap__, __reexportMap__ },
    }) => `\
    {
${exportsCellRecord(__fixedExportMap__)}${exportsCellRecord(
      __liveExportMap__,
    )}${exportsCellRecord(adaptReexport(__reexportMap__))}\
    },
`,
  ),
)}\
  ];

${''.concat(
  ...modules.flatMap(
    ({ index, indexedImports, record: { reexports, __reexportMap__ } }) => {
      const mappings = reexports.map(
        importSpecifier => `\
  Object.defineProperties(cells[${index}], Object.getOwnPropertyDescriptors(cells[${indexedImports[importSpecifier]}]));
`,
      );
      // Create references for export name as newname
      const namedReexportsToProcess = Object.entries(__reexportMap__);
      if (namedReexportsToProcess.length > 0) {
        mappings.push(`
  Object.defineProperties(cells[${index}], {${namedReexportsToProcess.map(
          ([specifier, renames]) => {
            return renames.map(
              ([localName, exportedName]) =>
                `${q(exportedName)}: { value: cells[${
                  indexedImports[specifier]
                }][${q(localName)}] }`,
            );
          },
        )} });
          `);
      }
      return mappings;
    },
  ),
)}\

  const namespaces = cells.map(cells => Object.freeze(Object.create(null, cells)));

  for (let index = 0; index < namespaces.length; index += 1) {
    cells[index]['*'] = cell('*', namespaces[index]);
  }

  const observeImports = (map, importName, importIndex) => {
    for (const [name, observers] of map.get(importName)) {
      const cell = cells[importIndex][name];
      if (cell === undefined) {
        throw new ReferenceError(\`Cannot import name \${name}\`);
      }
      for (const observer of observers) {
        cell.observe(observer);
      }
    }
  };

${''.concat(
  ...modules.map(
    ({
      index,
      indexedImports,
      record: { __liveExportMap__, __fixedExportMap__ },
    }) => `\
  functors[${index}]({
    imports(entries) {
      const map = new Map(entries);
${''.concat(
  ...Object.entries(indexedImports).map(
    ([importName, importIndex]) => `\
      observeImports(map, ${q(importName)}, ${importIndex});
`,
  ),
)}\
    },
    liveVar: {
${importsCellSetter(__liveExportMap__, index)}\
    },
    onceVar: {
${importsCellSetter(__fixedExportMap__, index)}\
    },
    importMeta: {},
  });
`,
  ),
)}\

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
