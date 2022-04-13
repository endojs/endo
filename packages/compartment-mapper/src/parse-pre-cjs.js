// @ts-check

import { parseLocatedJson } from './json.js';
import { wrap, dropFileProtocol } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

const locationParent = location => {
  const index = location.lastIndexOf('/');
  if (index >= 0) {
    return location.slice(0, index);
  }
  return location;
};

/** @type {import('./types.js').ParseFn} */
export const parsePreCjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const text = textDecoder.decode(bytes);
  const { source, imports, exports, reexports } = parseLocatedJson(
    text,
    location,
  );

  /**
   * @param {Object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(source);

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
      dropFileProtocol(locationParent(location)), // __dirname
    );

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
