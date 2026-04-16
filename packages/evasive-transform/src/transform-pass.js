/**
 * Provides {@link createEvasiveTransformPass}, a {@link TransformPass} adapter
 * for evasive transforms.
 *
 * @module
 */

/**
 * @import {TransformPass, CreateEvasiveTransformPassOptions} from './transform-pass-types.js'
 */

import { evadeComment, elideComment } from './transform-comment.js';
import { makeTransformCommentsVisitor } from './transform-ast.js';

/**
 * Creates a {@link TransformPass} compatible with `@endo/parser-pipeline` that
 * applies SES censorship evasion transforms as AST mutations.
 *
 * The visitor applies the same transforms as {@link evadeCensorSync} but
 * operates on an existing AST rather than parsing from source.
 *
 * @param {CreateEvasiveTransformPassOptions} [options]
 * @returns {TransformPass}
 */
export const createEvasiveTransformPass = (options = {}) => {
  const { elideComments = false, onlyComments = false } = options;
  const transformComment = elideComments ? elideComment : evadeComment;

  return {
    visitor: makeTransformCommentsVisitor({ transformComment, onlyComments }),
  };
};
