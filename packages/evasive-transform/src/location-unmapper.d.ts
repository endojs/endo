/**
 * A function which modifies an AST Node's source location
 *
 * @callback LocationUnmapper
 * @param {import('@babel/types').SourceLocation|null} [loc]
 * @returns {void}
 * @internal
 */
/**
 * Creates a {@link LocationUnmapper} function
 *
 * @internal
 * @param {string} sourceMap - Source map
 * @param {import('@babel/types').File} ast - AST as created by Babel
 * @returns {Promise<LocationUnmapper>}
 */
export function makeLocationUnmapper(sourceMap: string, ast: import('@babel/types').File): Promise<LocationUnmapper>;
/**
 * A function which modifies an AST Node's source location
 */
export type LocationUnmapper = (loc?: import("@babel/types").SourceLocation | null | undefined) => void;
//# sourceMappingURL=location-unmapper.d.ts.map