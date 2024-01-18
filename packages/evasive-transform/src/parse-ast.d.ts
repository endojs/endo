/**
 * This is the same type as `@babel/parser`'s `ParserOptions['sourceType']`, but
 * re-implemented here for decoupling purposes.
 *
 * Still, this is likely Babel-specific.
 *
 * @typedef {'module'|'script'|'unambiguous'} SourceType
 * @public
 */
/**
 * Options for {@link parseAst}.
 *
 * @typedef ParseAstOptions
 * @property {SourceType} [sourceType]
 * @internal
 */
/**
 * Adapter for parsing an AST.
 *
 * @param {string} source - Source code
 * @param {ParseAstOptions} [opts] - Options for underlying parser
 * @internal
 */
export function parseAst(source: string, opts?: ParseAstOptions | undefined): babelParser.ParseResult<import("@babel/types").File>;
/**
 * This is the same type as `@babel/parser`'s `ParserOptions['sourceType']`, but
 * re-implemented here for decoupling purposes.
 *
 * Still, this is likely Babel-specific.
 */
export type SourceType = 'module' | 'script' | 'unambiguous';
/**
 * Options for {@link parseAst }.
 */
export type ParseAstOptions = {
    sourceType?: SourceType | undefined;
};
import * as babelParser from '@babel/parser';
//# sourceMappingURL=parse-ast.d.ts.map