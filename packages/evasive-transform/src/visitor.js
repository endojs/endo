/**
 * Low-level Babel visitor factory for use with `@endo/parser-pipeline`.
 *
 * Exports {@link makeTransformCommentsVisitor} to build a
 * pipeline-compatible `TransformPass` from the evasive-transform logic.
 * The actual `createEvasiveTransformPass` wrapper lives in
 * `@endo/parser-pipeline`.
 *
 * @module
 */

export { makeTransformCommentsVisitor } from './transform-ast.js';
