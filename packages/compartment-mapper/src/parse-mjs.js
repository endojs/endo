// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';

const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  const record = new StaticModuleRecord(source, location);
  return {
    parser: 'mjs',
    bytes,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseMjs,
  heuristicImports: false,
};
