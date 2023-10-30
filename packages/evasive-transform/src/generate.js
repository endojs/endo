/**
 * Provides {@link generate}, which is the final step of the transformation
 *
 * @module
 */

import babelGenerate from '@babel/generator';

/**
 * It works; don't ask.
 * @type {typeof import('@babel/generator')}
 */
const { default: generator } = /** @type {any} */ (babelGenerate);

/**
 * Options for {@link generateCode} with source map
 *
 * @typedef GenerateAstOptionsWithSourceMap
 * @property {string} sourceUrl - If present, we will generate a source map
 * @internal
 */

/**
 * Options for {@link generateCode} (no source map generated)
 *
 * @typedef GenerateAstOptionsWithoutSourceMap
 * @property {undefined} sourceUrl - This should be undefined or otherwise not provided
 * @internal
 */

/**
 * The result of {@link generate}; depends on whether a `sourceUrl` was
 * provided to the options.
 *
 * @template {string|undefined} [SourceUrl=undefined]
 * @typedef {{code: string, map: SourceUrl extends string ? import('source-map').RawSourceMap : never}} TransformedResult
 * @internal
 */

/**
 * Generates new code from a Babel AST; returns code and source map
 *
 * @callback GenerateAstWithSourceMap
 * @param {import('@babel/types').File} ast - Babel "File" AST
 * @param {GenerateAstOptionsWithSourceMap} options - Options for the transform
 * @returns {TransformedResult<string>}
 * @internal
 */

/**
 * Generates new code from a Babel AST; returns code only
 *
 * @callback GenerateAstWithoutSourceMap
 * @param {import('@babel/types').File} ast - Babel "File" AST
 * @param {GenerateAstOptionsWithoutSourceMap} [options] - Options for the transform
 * @returns {TransformedResult<undefined>}
 * @internal
 */
export const generate =
  /** @type {GenerateAstWithSourceMap & GenerateAstWithoutSourceMap} */ (
    (ast, options) => {
      const sourceUrl = options?.sourceUrl;
      const result = generator(ast, {
        sourceFileName: sourceUrl,
        sourceMaps: Boolean(sourceUrl),
        retainLines: true,
        compact: true,
      });

      if (sourceUrl) {
        return {
          code: result.code,
          map: result.map,
        };
      }
      return {
        code: result.code,
      };
    }
  );
