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

import { mapNodeModules } from './node-modules.js';
import { makeScriptFromMap, makeFunctorFromMap } from './bundle-lite.js';

const textEncoder = new TextEncoder();

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
