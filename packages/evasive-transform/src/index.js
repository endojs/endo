/**
 * Entry point for this package.  Provides public API and types.
 *
 * @module
 */

/**
 * @import {TransformedResult, TransformedResultWithSourceMap} from './generate.js'
 */

import { transformAst } from './transform-ast.js';
import { parseAst } from './parse-ast.js';
import { generate } from './generate.js';

/**
 * Options for {@link evadeCensorSync}
 *
 * @typedef EvadeCensorOptions
 * @property {string} [sourceMap] - Original source map in JSON string or object form
 * @property {string} [sourceUrl] - URL or filepath of the original source in `code`
 * @property {boolean} [elideComments] - Replace comments with an ellipsis but preserve interior newlines.
 * @property {import('./parse-ast.js').SourceType} [sourceType] - Module source type
 * @property {boolean} [useLocationUnmap] - deprecated, vestigial
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions & {sourceUrl: string}} options - Options for the transform
 * @returns {TransformedResultWithSourceMap} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @returns {TransformedResult} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */
/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @public
 */
export function evadeCensorSync(source, options) {
  const {
    sourceMap,
    sourceUrl,
    sourceType,
    elideComments = false,
  } = options || {};

  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const ast = parseAst(source, {
    sourceType,
  });

  transformAst(ast, { elideComments });

  if (sourceUrl) {
    return generate(ast, { source, sourceUrl, sourceMap });
  }
  return generate(ast, { source });
}

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions & {sourceUrl: string}} options - Options for the transform
 * @returns {Promise<TransformedResultWithSourceMap>} Object containing new code and source map object (ready for stringification)
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @overload
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @returns {Promise<TransformedResult>} Object containing new code
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * @param {string} source - Source code to transform
 * @param {EvadeCensorOptions} [options] - Options for the transform
 * @public
 */
export async function evadeCensor(source, options) {
  return evadeCensorSync(source, options);
}
