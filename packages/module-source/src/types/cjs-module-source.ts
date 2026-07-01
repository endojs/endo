import type { SourceMapHook } from './module-source.js';

/**
 * Mutable state bag for the CJS Babel plugin, populated during analysis and
 * transform passes.
 */

export interface CjsTransformSourceParams {
  sourceType: 'commonjs';
  requires: string[];
  exports: Set<string>;
  reexports: Set<string>;
  imports: string[];
  unsafeGetters: Set<string>;
  dynamicImport: { present: boolean };
  starExportMap: Record<string, string>;
  sourceUrl?: string;
  sourceMapUrl?: string;
  sourceMap?: unknown;
  sourceMapHook?: SourceMapHook;
  allowHidden?: boolean;
}
/**
 * The frozen record produced by {@link CjsModuleSource} or the CJS
 * `buildRecord` function.
 *
 * This is NOT a `PrecompiledModuleSource`. It contains the analysis data plus
 * a pre-built CJS functor source string.
 */

export interface CjsModuleSourceRecord {
  /** Combined specifiers: `require()` + dynamic `import()` (deduped). */
  readonly imports: string[];

  /** Export names (always includes `'default'`). */
  readonly exports: string[];

  /** Specifiers that are wholesale reexported. */
  readonly reexports: string[];

  /**
   * The CJS function expression wrapping the transformed source.
   *
   * @example
   * ```
   * (function (require, exports, module, __filename, __dirname, $h_import) { 'use strict'; ... })
   * ```
   */
  readonly cjsFunctor: string;

  /** Whether any `import()` calls were found. */
  readonly __needsImport__: boolean;
}
