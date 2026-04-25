/**
 * Provides language behavior (parser) for importing CommonJS as a
 * virtual module source.
 *
 * @module
 */

/** @import {ParseFn} from './types.js' */

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { wrap, getModulePaths } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const { freeze } = Object;

/** @type {ParseFn} */
export const parseCjs = (
  bytes,
  _specifier,
  location,
  _packageLocation,
  { readPowers } = {},
) => {
  const originalSource = textDecoder.decode(bytes);

  const {
    requires: requires_,
    imports,
    exports,
    reexports,
    source,
  } = analyzeCommonJS(originalSource, location);

  const requires =
    imports.length > 0 ? [...new Set([...requires_, ...imports])] : requires_;

  if (!exports.includes('default')) {
    exports.push('default');
  }

  const { filename, dirname } = getModulePaths(readPowers, location);

  /**
   * @param {object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname, $h_import) { 'use strict'; ${source} })\n`,
    );

    const { require, moduleExports, module, afterExecute, importFn } = wrap({
      moduleEnvironmentRecord,
      compartment,
      resolvedImports,
      location,
      readPowers,
    });

    // In CommonJS, the top-level `this` is the `module.exports` object.
    functor.call(
      moduleExports,
      require,
      moduleExports,
      module,
      filename,
      dirname,
      importFn,
    );

    afterExecute();
  };

  const transformedBytes = textEncoder.encode(source);

  return {
    parser: 'cjs',
    bytes: transformedBytes,
    record: freeze({ imports: requires, exports, reexports, execute }),
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseCjs,
  heuristicImports: true,
  synchronous: true,
};
