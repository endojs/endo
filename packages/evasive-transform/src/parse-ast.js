/**
 * Provides {@link parseAst} adapter
 *
 * @module
 */

import * as babelParser from '@babel/parser';

const { parse: parseBabel } = babelParser;

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
export function parseAst(source, opts) {
  // Might not want to pass `opts` verbatim, but also might not matter!
  return parseBabel(source, opts);
}
