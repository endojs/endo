/**
 * Types for `createEvasiveTransformPass`.
 *
 * @module
 */

import type { Visitor } from '@babel/traverse';

/**
 * A mutating transform pass that rewrites AST nodes in place.
 *
 * Matches the `TransformPass` interface from `@endo/parser-pipeline`.
 */
export interface TransformPass {
  readonly visitor: Visitor;
}

/**
 * Options for {@link createEvasiveTransformPass}.
 */
export interface CreateEvasiveTransformPassOptions {
  /**
   * Empties comments but preserves interior newlines.
   */
  elideComments?: boolean;

  /**
   * If true, limits transformation to comment contents, preserving code
   * positions within each line.
   */
  onlyComments?: boolean;
}
