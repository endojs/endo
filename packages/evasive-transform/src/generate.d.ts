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
export const generate: GenerateAstWithSourceMap & GenerateAstWithoutSourceMap;
/**
 * Options for {@link generateCode } with source map
 */
export type GenerateAstOptionsWithSourceMap = {
    /**
     * - If present, we will generate a source map
     */
    sourceUrl: string;
};
/**
 * Options for {@link generateCode } (no source map generated)
 */
export type GenerateAstOptionsWithoutSourceMap = {
    /**
     * - This should be undefined or otherwise not provided
     */
    sourceUrl: undefined;
};
/**
 * The result of {@link generate }; depends on whether a `sourceUrl` was
 * provided to the options.
 */
export type TransformedResult<SourceUrl extends string | undefined = undefined> = {
    code: string;
    map: SourceUrl extends string ? import('source-map').RawSourceMap : never;
};
/**
 * Generates new code from a Babel AST; returns code and source map
 */
export type GenerateAstWithSourceMap = (ast: import('@babel/types').File, options: GenerateAstOptionsWithSourceMap) => TransformedResult<string>;
/**
 * Generates new code from a Babel AST; returns code only
 */
export type GenerateAstWithoutSourceMap = (ast: import('@babel/types').File, options?: GenerateAstOptionsWithoutSourceMap | undefined) => TransformedResult<undefined>;
//# sourceMappingURL=generate.d.ts.map