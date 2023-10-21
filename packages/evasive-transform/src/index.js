/**
 * Entry point for this package.  Provides public API and types.
 *
 * @module
 */

import { transformAst } from './transform-ast.js';
import { parseAst } from './parse-ast.js';
import { generate } from './generate.js';

/**
 * Options for {@link evadeCensor}
 *
 * @typedef EvadeCensorOptions
 * @property {string|import('source-map').RawSourceMap} [sourceMap] - Original source map in JSON string or object form
 * @property {string} [sourceUrl] - URL or filepath of the original source in `code`
 * @property {boolean} [useLocationUnmap] - Enable location unmapping. Only applies if `sourceMap` was provided
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
 * @returns {Promise<import('./generate.js').TransformedResult<T['sourceUrl']>>} Object containing new code and optionally source map object (ready for stringification)
 * @public
 */
export async function evadeCensor(source, options) {
  const { sourceMap, sourceUrl, useLocationUnmap, sourceType } = options ?? {};

  // See "Chesterton's Fence"
  await null;

  // Parse the rolled-up chunk with Babel.
  // We are prepared for different module systems.
  const ast = parseAst(source, {
    sourceType,
  });

  const sourceMapJson =
    typeof sourceMap === 'string' ? sourceMap : JSON.stringify(sourceMap);

  if (sourceMap && useLocationUnmap) {
    await transformAst(ast, { sourceMap: sourceMapJson, useLocationUnmap });
  } else {
    await transformAst(ast);
  }

  if (sourceUrl) {
    return generate(ast, { sourceUrl });
  }
  return generate(ast);
}
