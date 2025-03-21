/**
 * Provides {@link generate}, which is the final step of the transformation
 *
 * @module
 */

// @ts-ignore XXX no types defined
import babelGenerator from '@babel/generator';

// TODO The following is sufficient on Node.js, but for compatibility with
// `node -r esm`, we must use the pattern below.
// Restore after https://github.com/Agoric/agoric-sdk/issues/8671.
// OR, upgrading to Babel 8 probably addresses this defect.
// const { default: generator } = /** @type {any} */ (babelGenerator);
const generator = /** @type {typeof import('@babel/generator')['default']} */ (
  // @ts-ignore -- errors but not in typedoc build
  babelGenerator.default || babelGenerator
);

/**
 * Options for {@link generateCode} with source map
 *
 * @typedef GenerateAstOptionsWithSourceMap
 * @property {string} [source]
 * @property {string} sourceUrl - If present, we will generate a source map
 * @property {string} [sourceMap] - If present, the generated source map will be a transform over the given source map.
 * @internal
 */

/**
 * Options for {@link generateCode} (no source map generated)
 *
 * @typedef GenerateAstOptionsWithoutSourceMap
 * @property {string} [source]
 * @property {undefined} [sourceUrl] - This should be undefined or otherwise not provided
 * @internal
 */

/**
 * The result of {@link generate}; depends on whether a `sourceUrl` was
 * provided to the options.
 *
 * @template {string|undefined} [SourceUrl=undefined]
 * @typedef {{code: string, map: SourceUrl extends string ? string : never}} TransformedResult
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
      // TODO Use options?.sourceUrl when resolved:
      // https://github.com/Agoric/agoric-sdk/issues/8671
      const sourceUrl = options ? options.sourceUrl : undefined;
      const inputSourceMap =
        options && 'sourceMap' in options ? options.sourceMap : undefined;
      const source = options ? options.source : undefined;
      const result = generator(
        ast,
        {
          sourceFileName: sourceUrl,
          sourceMaps: Boolean(sourceUrl),
          // @ts-expect-error Property missing on versioned types
          inputSourceMap,
          retainLines: true,
          ...(source === undefined
            ? {}
            : { experimental_preserveFormat: true }),
        },
        source,
      );

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
