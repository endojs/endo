// @ts-check

import { StaticModuleRecord } from '@endo/static-module-record';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** @type {import('./types.js').ParseFn} */
export const parseArchiveMjs = async (
  bytes,
  _specifier,
  _location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  const record = new StaticModuleRecord(source);
  const pre = textEncoder.encode(JSON.stringify(record));
  return {
    parser: 'pre-mjs-json',
    bytes: pre,
    record,
  };
};

/** @type {import('./types.js').ParserImplementation} */
export default {
  parse: parseArchiveMjs,
  heuristicImports: false,
};
