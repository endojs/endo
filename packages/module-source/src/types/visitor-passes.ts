/**
 * Types for {@link createModuleSourcePasses}.
 *
 * @module
 */

import type { Visitor } from '@babel/traverse';
import type { FinalStaticModuleType } from 'ses';

/**
 * A read-only analysis pass compatible with `@endo/parser-pipeline`.
 *
 * @template TResult - The type of data this analyzer produces.
 */
export interface AnalyzerPass<TResult> {
  readonly visitor: Visitor;
  getResults(): TResult;
}

/**
 * A mutating transform pass compatible with `@endo/parser-pipeline`.
 */
export interface TransformPass {
  readonly visitor: Visitor;
}

/**
 * Results of module-source static analysis.
 */
export interface ModuleSourceAnalysis {
  /** Module specifiers imported by this module. */
  imports: string[];

  /** All exported names (live, fixed, and re-exported), sorted. */
  exports: string[];

  /** Module specifiers that are re-exported via `export * from`. */
  reexports: string[];

  liveExportMap: Record<string, [string, boolean]>;
  fixedExportMap: Record<string, [string]>;
  reexportMap: Record<string, [string, string][]>;

  /** Whether `import()` is used dynamically. */
  needsImport: boolean;

  /** Whether `import.meta` is referenced. */
  needsImportMeta: boolean;
}

/**
 * Return type of {@link createModuleSourcePasses}.
 */
export interface ModuleSourcePassesResult {
  /** Read-only analysis visitor that extracts imports, exports, and reexports. */
  analyzerPass: AnalyzerPass<ModuleSourceAnalysis>;

  /** Mutating visitor that rewrites ESM to a SES-compatible script functor. */
  transformPass: TransformPass;

  /**
   * Constructs a `ModuleSource`-compatible record from generated code and the
   * analysis state accumulated during the analyzer and transform passes.
   *
   * @param transformedSource - The code produced by `@babel/generator`.
   * @param sourceUrl - The source URL for the module.
   */
  buildRecord(
    transformedSource: string,
    sourceUrl?: string,
  ): FinalStaticModuleType;
}
