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

// XXX returns `any` to work around: The inferred type of 'parseAst' cannot be named without a reference to '@babel/parser/node_modules/@babel/types'. This is likely not portable. A type annotation is necessary.
/**
 * Adapter for parsing an AST.
 *
 * @param {string} source - Source code
 * @param {ParseAstOptions} [opts] - Options for underlying parser
 * @returns {any}
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
