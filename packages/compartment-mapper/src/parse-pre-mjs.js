// @ts-check

import { parseLocatedJson } from './json.js';

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parsePreMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const text = textDecoder.decode(bytes);
  const record = parseLocatedJson(text, location);
  // eslint-disable-next-line no-underscore-dangle
  record.__syncModuleProgram__ += `//# sourceURL=${location}\n`;
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
};
