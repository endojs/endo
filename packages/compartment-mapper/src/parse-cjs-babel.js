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
 * @import {ParseFn, ParserImplementation} from './types.js'
 */

import { CjsModuleSource } from '@endo/module-source';
import { buildCjsExecuteRecord } from './cjs.js';

const textDecoder = new TextDecoder();

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
