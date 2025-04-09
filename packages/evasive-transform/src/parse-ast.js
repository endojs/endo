/**
 * Provides {@link parseAst} adapter
 *
 * @module
 */

import * as babelParser from '@babel/parser';

const { parse: parseBabel } = babelParser;

/**
 * This is a subset of `@babel/parser`'s `ParserOptions['sourceType']`, but
 * re-implemented here for decoupling purposes.
 *
 * @typedef {'module' | 'script'} SourceType
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
export function parseAst(source, opts = {}) {
  // Might not want to pass `opts` verbatim, but also might not matter!
  return parseBabel(source, {
    tokens: true,
    createParenthesizedExpressions: true,
    allowReturnOutsideFunction: opts.sourceType === 'script',
    ...opts,
  });
}
