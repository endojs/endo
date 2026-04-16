/* eslint-disable no-underscore-dangle */
/**
 * Provides language behavior (parser) for importing CommonJS as a virtual
 * module source, using Babel AST analysis instead of the character-level lexer.
 *
 * Drop-in replacement for {@link parse-cjs.js}. Consumers opt in via the
 * pre-built parser map:
 *
 * ```js
 * import { parserForLanguageWithCjsBabel } from '@endo/compartment-mapper/import-parsers.js';
 *
 * await importLocation(readPowers, entryUrl, {
 *   parserForLanguage: parserForLanguageWithCjsBabel,
 * });
 * ```
 *
 * @module
 */

/**
 * @import {ParseFn, ParserImplementation, ReadFn, ReadPowers} from './types.js'
 * @import {CjsModuleSourceRecord} from '@endo/module-source'
 * @import {FinalStaticModuleType} from 'ses'
 */

import { CjsModuleSource } from '@endo/module-source';
import { wrap, getModulePaths } from './parse-cjs-shared-export-wrapper.js';

const textDecoder = new TextDecoder();

const { freeze } = Object;

/**
 * Converts a {@link CjsModuleSourceRecord} (which has a `cjsFunctor` string)
 * into a `FinalStaticModuleType`-compatible record (which has an `execute`
 * function). This is the bridge between the composed-pipeline CJS analysis and
 * the compartment-mapper execution model.
 *
 * Used by both {@link parseCjsBabel} (single-shot parser) and
 * {@link createCjsExecParser} (composed-pipeline parser) so the execution
 * logic lives in exactly one place.
 *
 * @param {CjsModuleSourceRecord} cjsRecord
 * @param {string} location
 * @param {ReadFn | ReadPowers | undefined} readPowers
 * @returns {FinalStaticModuleType}
 */
const buildCjsExecuteRecord = (cjsRecord, location, readPowers) => {
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

  return freeze({
    imports: cjsRecord.imports,
    exports: cjsRecord.exports,
    reexports: cjsRecord.reexports,
    execute,
  });
};

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

  return {
    parser: 'cjs',
    bytes,
    record: buildCjsExecuteRecord(cjsRecord, location, readPowers),
  };
};

/** @type {ParserImplementation} */
export default {
  parse: parseCjsBabel,
  heuristicImports: true,
  synchronous: true,
};
