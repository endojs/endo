/* Provides language behavior (parser) for importing CommonJS as a virtual
 * module source.
 */

// @ts-check

/** @import {ParseFn} from './types.js' */

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { wrap, getModulePaths } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {ParseFn} */
export const parseCjs = (
  bytes,
  _specifier,
  location,
  _packageLocation,
  { readPowers } = {},
) => {
  const source = textDecoder.decode(bytes);

  const {
    requires: imports,
    exports,
    reexports,
  } = analyzeCommonJS(source, location);

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
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const { require, moduleExports, module, afterExecute } = wrap({
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
    );

    afterExecute();
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({ imports, exports, reexports, execute }),
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseCjs,
  heuristicImports: true,
  synchronous: true,
};
