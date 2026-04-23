/**
 * Types for `ModuleSource` and its ilk.
 *
 * @module
 */

import type { PrecompiledModuleSource } from 'ses';
import type * as babelTypes from '@babel/types';
import type { Visitor } from '@babel/traverse';
import type { GeneratorOptions } from '@babel/generator';

/**
 * A {@link PrecompiledModuleSource} with additional fields for internal use.
 *
 * @internal
 */
export type ModuleSourceRecord = Readonly<
  PrecompiledModuleSource & {
    /**
     * Support for dynamic `import()` in ESM
     */
    __needsImport__: boolean;
    /**
     * Support for dynamic `import()` in ESM
     */
    __needsImportMeta__: boolean;
  }
>;

/**
 * Details for a {@link SourceMapHook}.
 *
 * **Do not confuse with `SourceMapHookDetails` type from `@endo/compartment-mapper`.**
 */
export interface SourceMapHookDetails {
  sourceUrl?: string;
  sourceMapUrl?: string;
  source: string;
}

/**
 * A SourceMapV3 object.
 */
export type SourceMapObject = {
  version: number;
  sources: string[];
  names: string[];
  sourceRoot?: string;
  sourcesContent?: string[];
  mappings: string;
  file?: string;
};

/**
 * A source map hook.
 *
 * **Do not confuse with `SourceMapHook` type from `@endo/compartment-mapper`.**
 * @param sourceMap A SourceMapV3 object
 * @param details Details
 */
export type SourceMapHook = (
  sourceMap: SourceMapObject,
  details: SourceMapHookDetails,
) => void;

/**
 * A bulging bucket of options for `transformSource`.
 */
export interface TransformSourceParams
  extends GeneratorOptions,
    SourceMapHookDetails {
  sourceType?: 'module';
  fixedExportMap: Record<string, any>;
  imports: Record<string, any>;
  exportAlls: string[];
  reexportMap: Record<string, any>;
  liveExportMap: Record<string, any>;
  hoistedDecls: Array<[string, boolean, string | undefined]>;
  importSources: Record<string, any>;
  importDecls: string[];
  dynamicImport: { present: boolean };
  importMeta: { present: boolean };
  sourceMapHook?: SourceMapHook;

  /**
   * This is either a string or a SourceMapV3 object, but it's used with an
   * undocumented option (`inputSourceMap` of `@babel/generator`), so might not
   * do anything at all.
   */
  sourceMap?: unknown;

  allowHidden?: boolean;
}

/**
 * @privateRemarks
 * The `types` parameter seems like a relic from when we were passing
 * Babel implementations around.
 */
export type PluginFactory = (params: { types: typeof babelTypes }) => {
  visitor: Visitor;
};

/**
 * Options for the `ModuleSource` constructor.
 */
export interface ModuleSourceOptions {
  sourceUrl?: string;
  sourceMap?: string;
  sourceMapUrl?: string;
  sourceMapHook?: SourceMapHook;
}

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
