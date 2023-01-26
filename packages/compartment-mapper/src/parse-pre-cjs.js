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

  const staticModuleRecord = {
    imports,
    reexports,
    exports,
    /**
     * @param {object} moduleEnvironmentRecord
     * @param {Compartment} compartment
     * @param {Record<string, string>} resolvedImports
     */
    execute(moduleEnvironmentRecord, compartment, resolvedImports) {
      let functor;
      /* eslint-disable-next-line no-underscore-dangle */
      const syncModuleFunctor = staticModuleRecord.__syncModuleFunctor__;
      if (syncModuleFunctor !== undefined) {
        functor = syncModuleFunctor;
      } else {
        functor = compartment.evaluate(source);
      }

      const { require, moduleExports, module, afterExecute } = wrap({
        moduleEnvironmentRecord,
        compartment,
        resolvedImports,
        location,
        readPowers,
      });

      functor(require, moduleExports, module, filename, dirname);

      afterExecute();
    },
  };

  return {
    parser: 'pre-cjs-json',
    bytes,
    record: staticModuleRecord,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parsePreCjs,
  heuristicImports: true,
};
