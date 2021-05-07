// @ts-check

import { parseLocatedJson } from './json.js';

const { freeze } = Object;

const textDecoder = new TextDecoder();

/** @type {ParseFn} */
export const parseJson = async (
  bytes,
  _specifier,
  location,
  _packageLocation,
) => {
  const source = textDecoder.decode(bytes);
  /** @type {Readonly<Array<string>>} */
  const imports = freeze([]);

  /**
   * @param {Object} exports
   */
  const execute = exports => {
    exports.default = parseLocatedJson(source, location);
  };
  return {
    parser: 'json',
    bytes,
    record: freeze({ imports, exports: freeze(['default']), execute }),
  };
};
