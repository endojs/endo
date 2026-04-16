/**
 * Types common to both the worker-based and composed parser pipelines.
 *
 * @module
 */

import type { Visitor } from '@babel/traverse';
import type {
  MJS_SOURCE_TYPE,
  CJS_SOURCE_TYPE,
  BABEL_SOURCE_TYPE_MODULE,
  BABEL_SOURCE_TYPE_COMMONJS,
} from '../constants.js';

/**
 * Function type that logs a message.
 * @group Common Types
 */
export type LogFn = (...args: readonly unknown[]) => void;

/**
 * A mutating transform pass that rewrites AST nodes in place.
 *
 * Transforms run after all analyzers have completed.
 * @group Common Types
 */
export interface TransformPass {
  /**
   * The visitor function that traverses the AST.
   */
  visitor: Visitor;
}

/**
 * Factory function that creates a fresh {@link AnalyzerPass} for each module.
 *
 * Called once per module before traversal begins. Each invocation must return
 * an instance with independent state so concurrent analyses do not interfere.
 *
 * @template TResult - The type of data the created analyzer produces.
 * @param location - The module's file URL.
 * @param specifier - The module specifier.
 * @returns An analyzer pass
 * @group Common Types
 */
export type AnalyzerFactory<TResult> = (
  location: string,
  specifier: string,
) => AnalyzerPass<TResult>;

/**
 * Factory function that creates a fresh {@link TransformPass} for each module.
 *
 * @group Common Types
 * @param location - The module's file URL.
 * @param specifier - The module specifier.
 * @returns A transform pass
 */
export type TransformFactory = (
  location: string,
  specifier: string,
) => TransformPass;

/**
 * A read-only analysis pass that extracts data from the AST without mutation.
 *
 * Analyzers run before transforms. Their visitors should not mutate AST nodes.
 *
 * @template TResult The type of data this analyzer produces.
 * @group Common Types
 */
export interface AnalyzerPass<TResult> {
  /**
   * Visitor function that traverses the AST.
   */
  visitor: Visitor;

  /**
   * Retrieves the analysis results after traversal completes.
   *
   * Must be called after the pipeline has finished traversing the AST.
   */
  getResults(): TResult;
}

/**
 * Language for ES modules
 * @group Common Types
 */
export type MjsSourceType = typeof MJS_SOURCE_TYPE;

/**
 * Language for CommonJS modules
 * @group Common Types
 */
export type CjsSourceType = typeof CJS_SOURCE_TYPE;

/**
 * Union of source types
 * @group Common Types
 */
export type SourceType = MjsSourceType | CjsSourceType;

/**
 * Valid Babel source types
 * @group Common Types
 */
export type BabelSourceType =
  | typeof BABEL_SOURCE_TYPE_MODULE
  | typeof BABEL_SOURCE_TYPE_COMMONJS;

/**
 * Data passed to the `onModuleComplete` callback after a module has been fully
 * analyzed and transformed.
 *
 * @template TAnalyzerResults - Tuple type of analyzer result types,
 *   positionally corresponding to the `analyzerFactories` array.
 * @group Common Types
 */
export interface ModuleCompleteData<
  TAnalyzerResults extends readonly unknown[],
> {
  /** The module's file URL. */
  location: string;
  /** The module specifier. */
  specifier: string;
  /**
   * Results from each analyzer, in the same order as `analyzerFactories`.
   */
  analyzerResults: TAnalyzerResults;
}
