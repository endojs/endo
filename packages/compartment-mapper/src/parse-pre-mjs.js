/**
 * @module Provides language-specific behaviors for importing pre-compiled ESM.
 * Pre-compiling or translating ESM from a module to a script with a
 * calling-convention is necessary to prepare an archive so that it can be
 * imported by the SES shim without entraining a dependency on Babel.
 */

// @ts-check

/** @import {ParseFn} from './types.js' */

import { parseLocatedJson } from './json.js';

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parsePreMjs = (
  bytes,
  _specifier,
  location,
  _packageLocation,
  { sourceMapUrl } = {},
) => {
  const text = textDecoder.decode(bytes);
  const record = parseLocatedJson(text, location);
  if (sourceMapUrl) {
    // eslint-disable-next-line no-underscore-dangle
    record.__syncModuleProgram__ += `//# sourceMappingURL=${sourceMapUrl}\n`;
  } else {
    // eslint-disable-next-line no-underscore-dangle
    record.__syncModuleProgram__ += `//# sourceURL=${location}\n`;
  }
  return {
    parser: 'pre-mjs-json',
    bytes,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parsePreMjs,
  heuristicImports: false,
  synchronous: true,
};
