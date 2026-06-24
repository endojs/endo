/**
 * Types for the `@endo/module-source/analyzer.js` subpath export.
 *
 * These types describe the low-level primitives used by `@endo/parser-pipeline`
 * to perform module-source analysis without tying `@endo/module-source` to any
 * parser-pipeline-specific interfaces.
 *
 * @module
 */

import type { Visitor } from '@babel/traverse';
import type { ModuleSourceRecord } from './module-source.js';

/**
 * An object containing a {@link Visitor}.
 */
export interface VisitorPlugin {
  readonly visitor: Visitor;
}

/**
 * Per-parse context returned by {@link analyzeModule} and {@link analyzeCjs}.
 *
 * Each call to `analyzeModule()` or `analyzeCjs()` creates a fresh instance
 * whose passes and state are independent from all other instances.
 *
 * The caller is responsible for:
 * 1. Traversing the AST with `ctx.analyzePass.visitor`.
 * 2. Traversing the (mutated) AST with `ctx.transformPass.visitor`.
 * 3. Generating code.
 * 4. Calling `buildRecord(generatedCode, location)` to get the module record.
 */
export interface AnalysisContext<T> {
  readonly analyzePass: VisitorPlugin;
  readonly transformPass: VisitorPlugin;
  buildRecord(generatedCode: string, location?: string): T;
}

/**
 * Options for {@link analyzeModule} and {@link analyzeCjs}.
 */
export interface AnalysisOptions {
  /**
   * Allow usage of hidden `$h_...` identifiers.
   *
   * @default false
   */
  allowHidden?: boolean;
}

/**
 * Context for ESM module analysis.
 */
export type ModuleAnalysisContext = AnalysisContext<ModuleSourceRecord>;
