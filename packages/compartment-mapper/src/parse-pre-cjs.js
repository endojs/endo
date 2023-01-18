// @ts-check

import { parseLocatedJson } from './json.js';
import { wrap, getModulePaths } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parsePreCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
  { readPowers } = {},
) => {
  const text = textDecoder.decode(bytes);
  const { source, imports, exports, reexports } = parseLocatedJson(
    text,
    location,
  );

  const { filename, dirname } = await getModulePaths(readPowers, location);

  /**
   * @param {object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(source);

    const { require, moduleExports, module, afterExecute } = wrap({
      moduleEnvironmentRecord,
      compartment,
      resolvedImports,
      location,
      readPowers,
    });

    functor(require, moduleExports, module, filename, dirname);

    afterExecute();
  };

  return {
    parser: 'pre-cjs-json',
    bytes,
    record: {
      imports,
      reexports,
      exports,
      execute,
    },
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parsePreCjs,
  heuristicImports: true,
};
