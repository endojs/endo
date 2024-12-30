/* eslint no-shadow: 0 */

/**
 * @import {
 *   StaticModuleType,
 *   PrecompiledStaticModuleInterface
 * } from 'ses'
 * @import {
 *   BundleOptions,
 *   CompartmentDescriptor,
 *   CompartmentMapDescriptor,
 *   CompartmentSources,
 *   MaybeReadPowers,
 *   ReadFn,
 *   ReadPowers,
 *   Sources,
 *   WriteFn,
 * } from './types.js'
 */

/**
 * The bundler kit defines a language-specific behavior for injecting a module
 * into a bundle.
 * Each module must allocate cells for its imports and exports, link those cells
 * to the cells of dependencies, and provide both the linker and evaluation behavior
 * for the module.
 * The linker behavior gets injected in a lexical scope with the linker runtime
 * and has access to the cells of all modules, whereas the evaluation behavior
 * gets injected in the generated script's top level lexical scope, so has
 * no accidental visibility into the linkage runtime.
 *
 * For example, JSON modules produce a single "default" cell ("getCells"):
 *
 *   { default: cell('default') },
 *
 * Then, the JSON gets injected verbatim for the evaluation behavior ("getFunctor").
 * The linker simply sets the cell to the value.
 *
 *   functors[0]['default'].set(modules[0]);
 *
 * For an ECMAScript or CommonJS module, the evaluation behavior is a function
 * that the linker runtime can call to inject it with the cells it needs by
 * the names it sees for them.
 *
 * @typedef {object} BundlerKit
 * @property {() => string} getFunctor Produces a JavaScript string consisting of
 * a function expression followed by a comma delimiter that will be evaluated in
 * a lexical scope with no free variables except the globals.
 * In the generated bundle runtime, the function will receive an environment
 * record: a record mapping every name of the corresponding module's internal
 * namespace to a "cell" it can use to get, set, or observe the linked
 * variable.
 * @property {() => string} getCells Produces a JavaScript string consisting of
 * a JavaScript object and a trailing comma.
 * The string is evaluated in the linker runtime's lexical context.
 * @property {() => string} getFunctorCall Produces a JavaScript string,
 * a statement that effects the module's evaluation behavior using the cells
 * it imports and exports and the evaluated "functor".
 * @property {() => string} getReexportsWiring Produces a JavaScript string
 * that may include statements that bind the cells reexported by this module.
 */

/**
 * @template {unknown} SpecificModuleSource
 * @typedef {object} BundleModule
 * @property {string} key
 * @property {string} exit
 * @property {string} compartmentName
 * @property {string} moduleSpecifier
 * @property {string} sourceDirname
 * @property {string} parser
 * @property {StaticModuleType & SpecificModuleSource} record
 * @property {Record<string, string>} resolvedImports
 * @property {Record<string, number>} indexedImports
 * @property {Uint8Array} bytes
 * @property {number} index
 * @property {BundlerKit} bundlerKit
 */

/**
 * @typedef {object} BundleExit
 * @property {string} exit
 * @property {number} index
 * @property {BundlerKit} bundlerKit
 * @property {Record<string, number>} indexedImports
 * @property {Record<string, string>} resolvedImports
 */

/**
 * @template {unknown} SpecificModuleSource
 * @callback GetBundlerKit
 * @param {BundleModule<SpecificModuleSource>} module
 * @param {object} params
 * @param {boolean} [params.useEvaluate]
 * @param {string} [params.sourceUrlPrefix]
 * @returns {BundlerKit}
 */

/**
 * @template {unknown} SpecificModuleSource
 * @typedef {object} BundlerSupport
 * @property {string} runtime
 * @property {GetBundlerKit<SpecificModuleSource>} getBundlerKit
 */

import { resolve } from './node-module-specifier.js';
import { mapNodeModules } from './node-modules.js';
import { link } from './link.js';
import { makeImportHookMaker } from './import-hook.js';
import { defaultParserForLanguage } from './archive-parsers.js';

import mjsSupport from './bundle-mjs.js';
import cjsSupport from './bundle-cjs.js';
import jsonSupport from './bundle-json.js';

const textEncoder = new TextEncoder();

const { quote: q } = assert;

/**
 * @param {BundleExit} source
 * @returns {BundlerKit}
 */
const makeCjsExitBundlerKit = ({ exit, index }) => ({
  getFunctor: () => `\
null,
`,
  getCells: () => `\
    namespaceCells(tryRequire(${JSON.stringify(exit)})),
`,
  getReexportsWiring: () => '',
  getFunctorCall: () => ``,
});

/**
 * Produces a list of modules in the order they should be evaluated, and
 * a side-table for following aliases.
 * The modules are produce in topological postorder, such that the entry
 * module appears last.
 * The post-order traversal does not revisit modules that appear in cycles.
 *
 * Synthesizes a unique key for each module and translates
 * each module's imports to their corresponding keys.
 * Some import keys are aliased to other keys, such that walking from
 * key to value in the aliases side table will eventually arrive at
 * the key of a module that is present in the modules list.
 *
 * The first modules are place-holders for the modules that exit
 * the compartment map to the host's module system.
 *
 * @param {Record<string, CompartmentDescriptor>} compartmentDescriptors
 * @param {Record<string, CompartmentSources>} compartmentSources
 * @param {string} entryCompartmentName
 * @param {string} entryModuleSpecifier
 * @param {Array<string>} exitModuleSpecifiers
 */
const sortedModules = (
  compartmentDescriptors,
  compartmentSources,
  entryCompartmentName,
  entryModuleSpecifier,
  exitModuleSpecifiers,
) => {
  /** @type {BundleModule<unknown>[]} */
  const modules = [];
  /** @type {Map<string, string>} aliaes */
  const aliases = new Map();
  /** @type {Set<string>} seen */
  const seen = new Set();

  for (const exit of exitModuleSpecifiers) {
    modules.push({
      key: exit,
      exit,
      // @ts-expect-error
      index: undefined,
      // @ts-expect-error
      bundlerKit: null,
    });
  }

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
      const { record, parser, deferredError, bytes, sourceDirname, exit } =
        source;
      if (exit !== undefined) {
        return exit;
      }
      assert(
        bytes !== undefined,
        `No bytes for ${moduleSpecifier} in ${compartmentName}`,
      );
      assert(
        parser !== undefined,
        `No parser for ${moduleSpecifier} in ${compartmentName}`,
      );
      assert(
        sourceDirname !== undefined,
        `No sourceDirname for ${moduleSpecifier} in ${compartmentName}`,
      );
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
          sourceDirname,
          parser,
          record,
          resolvedImports,
          bytes,
          // @ts-expect-error
          index: undefined,
          // @ts-expect-error
          bundlerKit: null,
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

/** @type {Record<string, BundlerSupport<any>>} */
const bundlerSupportForLanguage = {
  'pre-mjs-json': mjsSupport,
  'pre-cjs-json': cjsSupport,
  json: jsonSupport,
};

/** @param {string} language */
const getRuntime = language =>
  bundlerSupportForLanguage[language]
    ? bundlerSupportForLanguage[language].runtime
    : `/*unknown language:${language}*/`;

/**
 * @param {BundleModule<unknown>} module
 * @param {object} params
 * @param {boolean} [params.useEvaluate]
 * @param {string} [params.sourceUrlPrefix]
 */
const getBundlerKitForModule = (module, params) => {
  const language = module.parser;
  assert(language !== undefined);
  if (bundlerSupportForLanguage[language] === undefined) {
    const warning = `/*unknown language:${language}*/`;
    // each item is a function to avoid creating more in-memory copies of the source text etc.
    /** @type {BundlerKit} */
    return {
      getFunctor: () => `(()=>{${warning}}),`,
      getCells: () => `{${warning}},`,
      getFunctorCall: () => warning,
      getReexportsWiring: () => '',
    };
  }
  const { getBundlerKit } = bundlerSupportForLanguage[language];
  return getBundlerKit(module, params);
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {BundleOptions} [options]
 * @returns {Promise<string>}
 */
export const makeFunctorFromMap = async (
  readPowers,
  compartmentMap,
  options,
) => {
  const {
    moduleTransforms,
    syncModuleTransforms,
    searchSuffixes,
    sourceMapHook = undefined,
    useEvaluate = false,
    sourceUrlPrefix = undefined,
    format = undefined,
    parserForLanguage: parserForLanguageOption = {},
  } = options || {};

  /** @type {((module: BundleExit) => BundlerKit) | undefined} */
  let makeExitBundlerKit;
  if (format === 'cjs') {
    makeExitBundlerKit = makeCjsExitBundlerKit;
  }

  const parserForLanguage = Object.freeze(
    Object.assign(
      Object.create(null),
      defaultParserForLanguage,
      parserForLanguageOption,
    ),
  );

  const bundlerKitParams = {
    useEvaluate,
    sourceUrlPrefix,
  };

  const {
    compartments,
    entry: { compartment: entryCompartmentName, module: entryModuleSpecifier },
  } = compartmentMap;
  /** @type {string[]} */
  const exitModuleSpecifiers = [];
  /** @type {Sources} */
  const sources = Object.create(null);

  /**
   * @param {string} moduleSpecifier
   * @param {string} compartmentName
   */
  const exitModuleImportHook =
    format !== undefined
      ? /**
         * @param {string} moduleSpecifier
         * @param {string} compartmentName
         */
        async (moduleSpecifier, compartmentName) => {
          const compartmentSources =
            sources[compartmentName] || Object.create(null);
          sources[compartmentName] = compartmentSources;
          compartmentSources[moduleSpecifier] = {
            exit: moduleSpecifier,
          };
          exitModuleSpecifiers.push(moduleSpecifier);
          return { imports: [], exports: [], execute() {} };
        }
      : undefined;

  const makeImportHook = makeImportHookMaker(readPowers, entryCompartmentName, {
    archiveOnly: true,
    sources,
    compartmentDescriptors: compartments,
    searchSuffixes,
    entryCompartmentName,
    entryModuleSpecifier,
    sourceMapHook,
    importHook: exitModuleImportHook,
  });

  // Induce importHook to record all the necessary modules to import the given module specifier.
  const { compartment } = link(compartmentMap, {
    resolve,
    makeImportHook,
    moduleTransforms,
    syncModuleTransforms,
    parserForLanguage,
  });
  await compartment.load(entryModuleSpecifier);

  const { modules, aliases } = sortedModules(
    compartmentMap.compartments,
    sources,
    entryCompartmentName,
    entryModuleSpecifier,
    exitModuleSpecifiers,
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
    if (module.exit !== undefined) {
      if (makeExitBundlerKit === undefined) {
        // makeExitBundlerKit must have been provided to makeImportHookMaker for any modules with an exit property to have been created.
        throw TypeError('Unreachable');
      }
      module.bundlerKit = makeExitBundlerKit(module);
    } else {
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
              )}`,
            );
          }
          const { index } = module;
          return [importSpecifier, index];
        }),
      );
      parsersInUse.add(module.parser);
      module.bundlerKit = getBundlerKitForModule(module, bundlerKitParams);
    }
  }

  // Some bundles appeal to the host module system appropriate to their format
  // like `require` for bundles used as CommonJS modules.
  // Each module in the modules array is constructed by a language-specific bundler kit,
  // and in the case of an exit module, is a bundler kit made with
  // makeExitBundlerKit, like makeCjsExitBundlerKit.
  // This will generate a module initialization runtime that in turn needs this
  // namespaceCells utility function to take a host module exports namespace
  // and turn it into a bank of cells for importing and exporting the
  // properties of the module exports namespace object.
  const exitNamespaces =
    exitModuleSpecifiers.length === 0
      ? ''
      : `\
  const namespaceCells = namespace => fromEntries(
    getOwnPropertyNames(namespace)
    .map(name => [name, {
      get() {
        return get(namespace, name);
      },
      set() {
        throw new TypeError('Non-writable export');
      },
      observe(observer) {
        observer(get(namespace, name));
      },
      enumerable: true,
    }])
  );
`;

  // The linkage runtime creates a cell for every value exported by any of the
  // bundled modules.
  // The interface of a cell is very much like a getter/setter property
  // deescriptor, and additionally has a method for registering an observer to
  // notice when a variable is changed in its originating module, to support
  // live bindings.
  // Each module language defines its own behavior for the generation of its
  // exported cells.
  // After all cells are allocated, each language gets a second opportunity
  // to introduce bindings for cells that the module re-exports from another
  // module, but does not itself own.
  const runtimeLinkageCells = `\
  const cell = (name, value = undefined) => {
    const observers = [];
    return freeze({
      get: freeze(() => {
        return value;
      }),
      set: freeze((newValue) => {
        value = newValue;
        for (const observe of observers) {
          observe(value);
        }
      }),
      observe: freeze((observe) => {
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
`;

  // The linker runtime includes a parallel array of module exports namespace
  // objects for each bundled module, for each respective index of the module
  // functors array.
  // Each namespace has a special '*' property for the namespace object itself,
  // which is what modules obtain with `import * as x from 'x'` notation.
  const moduleNamespaces = `\
  const namespaces = cells.map(cells => freeze(create(null, {
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
`;

  // Each language in use within the bundle has an opportunity to inject
  // utilities into the bundle runtime that it can use in the shared lexical
  // scope of module execution.
  // CommonJS in particular injects a utility function here, if the script
  // entrains any CommonJS modules.
  const languageRuntimeExtensions = `\
${''.concat(...Array.from(parsersInUse).map(parser => getRuntime(parser)))}\
`;

  // This section of the linker runtime causes each of the modules to execute
  // in topological order, using a language-specific calling convention to
  // link its imports and exports to other modules.
  const moduleExecutionRuntime = `\
${''.concat(...modules.map(m => m.bundlerKit.getFunctorCall()))}\
`;

  // The linker runtime receives an array of language-specific representations
  // of each module, which in the simplest case is just a function and a
  // runtime initialization calling convention (a functor).
  // Then, in the style of partial application, it receives runtime options.
  // When driven by makeScript, the script will statically apply the options,
  // but with makeFunctor, the runtime must evaluate and apply runtime options.
  // Scripts are suitable for injection with <script> tags on the web, whereas
  // functors require use of an evaluator at runtime.
  const linkerRuntime = `functors => options => {
  'use strict';

  const {
    Map,
    Object,
    ReferenceError,
    Reflect,
    TypeError,
  } = globalThis;
  const {
    create,
    defineProperties,
    defineProperty,
    freeze,
    fromEntries,
    getOwnPropertyDescriptors,
    getOwnPropertyNames,
    keys,
  } = Object;
  const { get, set } = Reflect;

  const {
${
  !useEvaluate
    ? ''
    : `\
    evaluate = eval,
    sourceUrlPrefix = ${JSON.stringify(sourceUrlPrefix)},
`
}\
${
  format !== 'cjs'
    ? ''
    : `\
    require: tryRequire = typeof require === 'function' ? require : specifier => {
      throw new TypeError('Cannot import host module: ' + specifier);
    },
`
}\
  } = options || {};

${
  !useEvaluate
    ? ''
    : `\
  const evaluateSource = (source, sourceUrl) => {
    return evaluate(source + '\\n//# sourceURL=' + sourceUrlPrefix + sourceUrl + '\\n');
  };`
}\

${exitNamespaces}\

${runtimeLinkageCells}\

${moduleNamespaces}\

${languageRuntimeExtensions}\

${moduleExecutionRuntime}\

  return cells[cells.length - 1]['*'].get();
}`;

  // An array of language-specific representations of each bundled module,
  // which in the simplest case is a function that must be initialized by the
  // linkage runtime using a calling convention.
  // We pass this array into the linkage runtime rather than embedding it in
  // the linkage runtime in order to assure that the runtime's lexical context
  // doesn't overshadow each module's lexical scope.
  const moduleFunctors = `[
${''.concat(
  ...modules.map(
    (m, index) => `\
// === ${index}. ${m.sourceDirname} ${m.moduleSpecifier} ===
${m.bundlerKit.getFunctor()}`,
  ),
)}\
]`;

  // Functors partially apply the linker runtime.
  // Scripts go on to apply static options and execute immediately.
  return `(${linkerRuntime})(${moduleFunctors})`;
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {CompartmentMapDescriptor} compartmentMap
 * @param {BundleOptions} [options]
 * @returns {Promise<string>}
 */
export const makeScriptFromMap = async (
  readPowers,
  compartmentMap,
  options,
) => {
  // Functors partially apply the linker runtime.
  // Scripts go on to apply static options and execute immediately.
  const functor = await makeFunctorFromMap(readPowers, compartmentMap, options);
  return `${functor}()`;
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {BundleOptions} [options]
 * @returns {Promise<string>}
 */
export const makeFunctor = async (readPowers, moduleLocation, options) => {
  const compartmentMap = await mapNodeModules(
    readPowers,
    moduleLocation,
    options,
  );
  return makeFunctorFromMap(readPowers, compartmentMap, options);
};

/**
 * @param {ReadFn | ReadPowers | MaybeReadPowers} readPowers
 * @param {string} moduleLocation
 * @param {BundleOptions} [options]
 * @returns {Promise<string>}
 */
export const makeScript = async (readPowers, moduleLocation, options) => {
  const compartmentMap = await mapNodeModules(
    readPowers,
    moduleLocation,
    options,
  );
  return makeScriptFromMap(readPowers, compartmentMap, options);
};

/**
 * @param {WriteFn} write
 * @param {ReadFn} read
 * @param {string} bundleLocation
 * @param {string} moduleLocation
 * @param {BundleOptions} [options]
 */
export const writeScript = async (
  write,
  read,
  bundleLocation,
  moduleLocation,
  options,
) => {
  const bundleString = await makeScript(read, moduleLocation, options);
  const bundleBytes = textEncoder.encode(bundleString);
  await write(bundleLocation, bundleBytes);
};
