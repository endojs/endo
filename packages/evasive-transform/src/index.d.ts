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
export function evadeCensor<T extends EvadeCensorOptions>(source: string, options?: T | undefined): Promise<import("./generate.js").TransformedResult<T["sourceUrl"]>>;
/**
 * Options for {@link evadeCensor }
 */
export type EvadeCensorOptions = {
    /**
     * - Original source map in JSON string or object form
     */
    sourceMap?: string | import("source-map").RawSourceMap | undefined;
    /**
     * - URL or filepath of the original source in `code`
     */
    sourceUrl?: string | undefined;
    /**
     * - Enable location unmapping. Only applies if `sourceMap` was provided
     */
    useLocationUnmap?: boolean | undefined;
    /**
     * - Module source type
     */
    sourceType?: import("./parse-ast.js").SourceType | undefined;
};
//# sourceMappingURL=index.d.ts.map