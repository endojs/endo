/**
 * Helpers for option handling.
 *
 * @module
 */

/**
 * @import {TransformSourceParams, CjsTransformSourceParams} from './types/module-source.js'
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
 * Creates a fresh `sourceOptions` object with the mutable state properties
 * that `makeCjsModulePlugins` populates during CJS analysis and transform
 * passes.
 *
 * @template {object} T
 * @overload
 * @param {T} overrides
 * @returns {CjsTransformSourceParams & T}
 */
/**
 * Creates a fresh `sourceOptions` object with the mutable state properties
 * that `makeCjsModulePlugins` populates during CJS analysis and transform
 * passes.
 *
 * @overload
 * @returns {CjsTransformSourceParams}
 */

/**
 * @template {object} T
 * @param {T} [overrides]
 */
export const createCjsSourceOptions = overrides =>
  /** @type {CjsTransformSourceParams} */ ({
    sourceType: 'commonjs',
    /** @type {string[]} */
    requires: [],
    /** @type {Set<string>} */
    exports: new Set(),
    /** @type {Set<string>} */
    reexports: new Set(),
    /** @type {string[]} */
    imports: [],
    /** @type {Set<string>} */
    unsafeGetters: new Set(),
    dynamicImport: { present: false },
    /** @type {Record<string, string>} */
    starExportMap: Object.create(null),
    ...(overrides ?? {}),
  });
