/* Provides a set of default language behaviors (parsers) suitable for creating
 * archives (zip files with a `compartment-map.json` and a file for each
 * module) with pre-compiled sources.
 *
 * This module entrains a dependency upon the core of Babel.
 */
/** @import {ParserForLanguage} from './types.js' */

import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserArchiveCjs from './parse-archive-cjs.js';
import parserArchiveMjs from './parse-archive-mjs.js';

/** @satisfies {Readonly<ParserForLanguage>} */
export const defaultParserForLanguage = Object.freeze(
  /** @type {const} */ ({
    mjs: parserArchiveMjs,
    'pre-mjs-json': parserArchiveMjs,
    cjs: parserArchiveCjs,
    'pre-cjs-json': parserArchiveCjs,
    json: parserJson,
    text: parserText,
    bytes: parserBytes,
  }),
);
