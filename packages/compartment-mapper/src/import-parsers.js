/** @import {ParserForLanguage} from './types.js' */

import parserJson from './parse-json.js';
import parserText from './parse-text.js';
import parserBytes from './parse-bytes.js';
import parserCjs from './parse-cjs.js';
import parserMjs from './parse-mjs.js';

/** @satisfies {Readonly<ParserForLanguage>} */
export const defaultParserForLanguage = Object.freeze(
  /** @type {const} */ ({
    mjs: parserMjs,
    cjs: parserCjs,
    json: parserJson,
    text: parserText,
    bytes: parserBytes,
  }),
);
