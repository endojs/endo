/* eslint no-underscore-dangle: ["off"] */

/**
 * Provides {@link CjsModuleSource}, a constructor that parses, analyzes,
 * transforms, and builds a CJS module record in one step.
 *
 * Parallel to {@link ModuleSource} for ESM.
 *
 * @module
 */

import { makeCjsAnalyzer } from './cjs-transform-analyze.js';

/**
 * @import {ModuleSourceOptions} from './types/module-source.js'
 */

const freeze = /** @type {<T>(v: T) => T} */ (Object.freeze);

const analyzeCjs = makeCjsAnalyzer();

/**
 * `CjsModuleSource` captures the effort of parsing and analyzing CommonJS
 * module text, producing a frozen record with import/export metadata and a
 * pre-built functor source string.
 *
 * **IMPORTANT**: This is _not_ a drop-in replacement for `ModuleSource`; it
 * does not have the same shape. The resulting object needs an `execute` method
 * to be recognized as a `ThirdPartyStaticModuleInterface`. Because providing a
 * working method invariably relies on `ReadPowers`, its implementation is not
 * provided within `@endo/module-source`. See `@endo/compartment-mapper/cjs.js`
 * for an adapter that provides an `execute` method.
 *
 * @class
 * @param {string} source - The CommonJS source text.
 * @param {string | ModuleSourceOptions} [opts]
 */
export function CjsModuleSource(source, opts = {}) {
  if (new.target === undefined) {
    throw TypeError(
      "Class constructor CjsModuleSource cannot be invoked without 'new'",
    );
  }
  if (typeof opts === 'string') {
    opts = { sourceUrl: opts };
  }
  const record = analyzeCjs(source, opts);
  this.imports = record.imports;
  this.exports = record.exports;
  this.reexports = record.reexports;
  this.cjsFunctor = record.cjsFunctor;
  this.__needsImport__ = record.__needsImport__;
  freeze(this);
}

freeze(CjsModuleSource.prototype);
freeze(CjsModuleSource);
