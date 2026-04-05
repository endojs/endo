/**
 * Shared helpers for creating the mutable state bag consumed by
 * {@link makeModulePlugins} and for extracting Babel visitors from plugins.
 *
 * @module
 */

import * as babelTypes from '@babel/types';

/**
 * @import {PluginFactory, TransformSourceParams} from './types/module-source.js'
 * @import {Visitor} from '@babel/traverse'
 */

/**
 * Creates a fresh `sourceOptions` object with the mutable state properties
 * that `makeModulePlugins` populates during analysis and transform passes.
 *
 * Callers pass overrides for fields like `sourceUrl`, `sourceMap`,
 * `allowHidden`, etc.
 *
 * @template {object} T
 * @overload
 * @param {T} overrides
 * @returns {TransformSourceParams & T}
 */
/**
 * Creates a fresh `sourceOptions` object with the mutable state properties
 * that `makeModulePlugins` populates during analysis and transform passes.
 *
 * @overload
 * @returns {TransformSourceParams}
 */

/**
 * Creates a fresh `sourceOptions` object with the mutable state properties
 * that `makeModulePlugins` populates during analysis and transform passes.
 *
 * Callers pass overrides for fields like `sourceUrl`, `sourceMap`,
 * `allowHidden`, etc.
 *
 * @template {object} T
 * @param {T} [overrides]
 */
export const createSourceOptions = overrides => ({
  sourceType: 'module',
  fixedExportMap: Object.create(null),
  imports: Object.create(null),
  exportAlls: [],
  reexportMap: Object.create(null),
  liveExportMap: Object.create(null),
  /** @type {Array<[string, boolean, string | undefined]>} */
  hoistedDecls: [],
  importSources: Object.create(null),
  importDecls: [],
  dynamicImport: { present: false },
  importMeta: { present: false },
  ...(overrides ?? {}),
});

/**
 * Extracts the Babel visitor from a Babel plugin factory function.
 *
 * @param {PluginFactory} plugin A Babel plugin factory (receives `{ types }`)
 * @returns {Visitor}
 */
export const visitorFromPlugin = plugin =>
  plugin({ types: babelTypes }).visitor;
