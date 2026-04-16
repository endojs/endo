/**
 * Provides {@link getBabelSourceType}.
 *
 * @module
 */

import {
  MJS_SOURCE_TYPE,
  BABEL_SOURCE_TYPE_MODULE,
  CJS_SOURCE_TYPE,
  BABEL_SOURCE_TYPE_COMMONJS,
} from './constants.js';

/**
 * @import {SourceType, BabelSourceType} from './types/external.js'
 */

/**
 * Converts a {@link SourceType} to a {@link BabelSourceType}.
 *
 * @throws {TypeError} If the source type is not supported.
 * @param {SourceType} sourceType One of `mjs` or `cjs`
 * @returns {BabelSourceType} One of `module` or `commonjs`
 */
export const getBabelSourceType = sourceType => {
  /** @type {BabelSourceType} */
  let babelSourceType;
  switch (sourceType) {
    case MJS_SOURCE_TYPE:
      babelSourceType = BABEL_SOURCE_TYPE_MODULE;
      break;
    case CJS_SOURCE_TYPE:
      babelSourceType = BABEL_SOURCE_TYPE_COMMONJS;
      break;
    default:
      throw new TypeError(
        `Composed parser encountered unsupported source type: ${sourceType}. Allowed values are: "${MJS_SOURCE_TYPE}" and "${CJS_SOURCE_TYPE}"`,
      );
  }
  return babelSourceType;
};
