import type { PrecompiledModuleSource } from 'ses';
import type * as babelTypes from '@babel/types';
import type { Visitor } from '@babel/traverse';
import type { GeneratorOptions } from '@babel/generator';
import type { ParserOptions } from '@babel/parser';

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
 * A bulging bucket of options for `transformSource`.
 */
export interface TransformSourceParams
  extends GeneratorOptions,
    SourceMapHookDetails {
  sourceType: ParserOptions['sourceType'];
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
}

/**
 * @todo The `types` parameter seems like a relic from when we were passing
 * Babel implementations around.
 */
export type PluginFactory = (params: { types: typeof babelTypes }) => {
  visitor: Visitor;
};

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
  sourceRoot?: string | undefined;
  sourcesContent?: string[] | undefined;
  mappings: string;
  file: string;
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
 * Options for the `ModuleSource` constructor.
 */
export interface ModuleSourceOptions {
  sourceUrl?: string;
  sourceMap?: string;
  sourceMapUrl?: string;
  sourceMapHook?: SourceMapHook;
}
