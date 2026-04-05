/* eslint-disable no-underscore-dangle */
/**
 * Provides language behavior (parser) for importing CommonJS as a virtual
 * module source, using Babel AST analysis instead of the character-level lexer.
 *
 * Drop-in replacement for {@link parse-cjs.js}. Consumers opt in by
 * overriding the `cjs` key in `parserForLanguage`:
 *
 * ```js
 * import parserCjsBabel from '@endo/compartment-mapper/parse-cjs-babel.js';
 *
 * await importLocation(readPowers, entryUrl, {
 *   parserForLanguage: { cjs: parserCjsBabel },
 * });
 * ```
 *
 * @module
 */

/**
 * @import {ParseFn} from './types.js'
 * @import {ParserImplementation} from './types.js'
 */

import { CjsModuleSource } from '@endo/module-source';
import { wrap, getModulePaths } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/** @type {ParseFn} */
export const parseCjsBabel = (
  bytes,
  _specifier,
  location,
  _packageLocation,
  { readPowers } = {},
) => {
  const source = textDecoder.decode(bytes);
  const cjsRecord = new CjsModuleSource(source, { sourceUrl: location });
  const { filename, dirname } = getModulePaths(readPowers, location);

  /**
   * @param {object} moduleEnvironmentRecord
   * @param {Compartment} compartment
   * @param {Record<string, string>} resolvedImports
   */
  const execute = (moduleEnvironmentRecord, compartment, resolvedImports) => {
    const functor = compartment.evaluate(cjsRecord.cjsFunctor);

    const wrapResult = wrap({
      moduleEnvironmentRecord,
      compartment,
      resolvedImports,
      location,
      readPowers,
    });

    const args = [
      wrapResult.require,
      wrapResult.moduleExports,
      wrapResult.module,
      filename,
      dirname,
    ];

    if (cjsRecord.__needsImport__ && wrapResult.importFn) {
      args.push(wrapResult.importFn);
    }

    functor.call(wrapResult.moduleExports, ...args);

    wrapResult.afterExecute();
  };

  return {
    parser: 'cjs',
    bytes,
    record: freeze({
      imports: cjsRecord.imports,
      exports: cjsRecord.exports,
      reexports: cjsRecord.reexports,
      execute,
    }),
  };
};

/** @type {ParserImplementation} */
export default {
  parse: parseCjsBabel,
  heuristicImports: true,
  synchronous: true,
};
