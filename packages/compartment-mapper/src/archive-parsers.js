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
