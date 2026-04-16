/**
 * Builds the CJS functor source string and assembles the frozen CJS module
 * record.
 *
 * Analogous to {@link functor.js} for ESM, but much simpler; CJS needs no
 * import-map preamble or hoisted declarations.
 *
 * @module
 */

import * as h from './hidden.js';

/**
 * @import {CjsTransformSourceParams, CjsModuleSourceRecord} from './types/module-source.js'
 */

const { freeze: objectFreeze } = Object;

/** @type {<T>(v: T) => T} */
const freeze = /** @type {any} */ (objectFreeze);

/**
 * Wraps transformed CJS source in a function expression suitable for
 * `compartment.evaluate()`.
 *
 * When dynamic `import()` was detected, the `$h͏_import` hidden identifier is
 * included as a parameter so the compartment can inject the import function.
 *
 * @param {string} scriptSource - The code produced by `@babel/generator`.
 * @param {CjsTransformSourceParams} sourceOptions - The mutable state bag.
 * @param {string} [sourceUrl] - The source URL for the module.
 * @returns {string} The functor source string.
 */
export const buildCjsFunctorSource = (
  scriptSource,
  sourceOptions,
  sourceUrl,
) => {
  const needsImport = sourceOptions.dynamicImport.present;
  const params = needsImport
    ? `require, exports, module, __filename, __dirname, ${h.HIDDEN_IMPORT}`
    : 'require, exports, module, __filename, __dirname';

  let functorSource = `(function (${params}) { 'use strict'; ${scriptSource} //*/\n})\n`;
  if (sourceUrl) {
    functorSource += `//# sourceURL=${sourceUrl}\n`;
  }
  return functorSource;
};

/**
 * Assembles a frozen `CjsModuleSourceRecord` from the analysis state and the
 * functor source string.
 *
 * @param {CjsTransformSourceParams} sourceOptions - The mutable state bag
 *   populated by `makeCjsModulePlugins`.
 * @param {string} functorSource - The functor source string from
 *   {@link buildCjsFunctorSource}.
 * @returns {CjsModuleSourceRecord}
 */
export const buildCjsModuleRecord = (sourceOptions, functorSource) => {
  const exports = [...sourceOptions.exports].filter(
    name => !sourceOptions.unsafeGetters.has(name),
  );
  if (!exports.includes('default')) {
    exports.push('default');
  }

  const imports = sourceOptions.dynamicImport.present
    ? [...new Set([...sourceOptions.requires, ...sourceOptions.imports])]
    : [...sourceOptions.requires];

  return freeze({
    imports: freeze(imports),
    exports: freeze(exports),
    reexports: freeze([...sourceOptions.reexports]),
    cjsFunctor: functorSource,
    __needsImport__: sourceOptions.dynamicImport.present,
  });
};
