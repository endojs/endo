// @ts-check

import { analyzeCommonJS } from '@endo/cjs-module-analyzer';
import { wrap, dropFileProtocol } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {import('./types.js').ParseFn} */
export const parseCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);

  const { requires: imports, exports, reexports } = analyzeCommonJS(
    source,
    location,
  );

  if (!exports.includes('default')) {
    exports.push('default');
  }

  /**
   * @param {Object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(
      `(function (require, exports, module, __filename, __dirname) { ${source} //*/\n})\n//# sourceURL=${location}`,
    );

    const { require, moduleExports, module, afterExecute } = wrap(
      moduleEnvironmentRecord,
      compartment,
      resolvedImports,
    );

    functor(
      require,
      moduleExports,
      module,
      dropFileProtocol(location), // __filename
      dropFileProtocol(new URL('./', location).toString()), // __dirname
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
};
