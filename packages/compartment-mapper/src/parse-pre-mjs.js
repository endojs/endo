// @ts-check

import { parseLocatedJson } from './json.js';

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parsePreMjs = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const text = textDecoder.decode(bytes);
  const record = parseLocatedJson(text, location);
  return {
    parser: 'pre-mjs-json',
    bytes,
    record,
  };
};
