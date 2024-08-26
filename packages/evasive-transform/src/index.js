/**
 * Entry point for this package.  Provides public API and types.
 *
 * @module
 */

/**
 * @import {TransformedResult} from './generate.js'
 */

import { transformAst } from './transform-ast.js';
import { parseAst } from './parse-ast.js';
import { generate } from './generate.js';

/**
 * Options for {@link evadeCensorSync}
 *
 * @typedef EvadeCensorOptions
 * @property {string|import('source-map-js').RawSourceMap} [sourceMap] - Original source map in JSON string or object form
 * @property {string} [sourceUrl] - URL or filepath of the original source in `code`
 * @property {boolean} [useLocationUnmap] - Enable location unmapping. Only applies if `sourceMap` was provided
 * @property {boolean} [elideComments] - Replace comments with an ellipsis but preserve interior newlines.
 * @property {import('./parse-ast.js').SourceType} [sourceType] - Module source type
 * @public
 */

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * If the `sourceMap` option is _not_ provided, the `useLocationUnmap` option
 * will have no effect.
 *
 * @template {EvadeCensorOptions} T
 * @param {string} source - Source code to transform
 * @param {T} [options] - Options for the transform
 * @returns {TransformedResult<T['sourceUrl']>} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */
export function evadeCensorSync(source, options) {
  // TODO Use options ?? {} when resolved:
  // https://github.com/Agoric/agoric-sdk/issues/8671
  const {
    sourceMap,
    sourceUrl,
    useLocationUnmap,
    sourceType,
    elideComments = false,
  } = options || {};

  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const ast = parseAst(source, {
    sourceType,
  });

  const sourceMapJson =
    typeof sourceMap === 'string' ? sourceMap : JSON.stringify(sourceMap);

  if (sourceMap && useLocationUnmap) {
    transformAst(ast, {
      sourceMap: sourceMapJson,
      useLocationUnmap,
      elideComments,
    });
  } else {
    transformAst(ast, { elideComments });
  }

  if (sourceUrl) {
    return generate(ast, { sourceUrl });
  }
  return generate(ast);
}

/**
 * Apply SES censorship evasion transforms on the given code `source`
 *
 * If the `sourceUrl` option is provided, the `map` property of the fulfillment
 * value will be a source map object; otherwise it will be `undefined`.
 *
 * If the `sourceMap` option is _not_ provided, the `useLocationUnmap` option
 * will have no effect.
 *
 * @template {EvadeCensorOptions} T
 * @param {string} source - Source code to transform
 * @param {T} [options] - Options for the transform
 * @returns {Promise<TransformedResult<T['sourceUrl']>>} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */
export async function evadeCensor(source, options) {
  return evadeCensorSync(source, options);
}
