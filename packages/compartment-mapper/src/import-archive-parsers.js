/* Provides a set of default language behaviors (parsers) suitable for
 * evaluating archives (zip files with a `compartment-map.json` and a file for
 * each module) with pre-compiled ESM and CommonJS.
 *
 * This module does not entrain a dependency on Babel.
 */
/** @import {ParserForLanguage} from './types.js' */

import parserPreCjs from './parse-pre-cjs.js';
import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserPreMjs from './parse-pre-mjs.js';

/** @satisfies {Readonly<ParserForLanguage>} */
export const defaultParserForLanguage = Object.freeze(
  /** @type {const} */ ({
    'pre-cjs-json': parserPreCjs,
    'pre-mjs-json': parserPreMjs,
    json: parserJson,
    text: parserText,
    bytes: parserBytes,
  }),
);
