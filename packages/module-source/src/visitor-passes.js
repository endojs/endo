/**
 * Provide functions which create paired analyzer and transform visitor passes
 * for use with `@endo/parser-pipeline`.
 *
 * @module
 */

/**
 * @import {ModuleSourcePassesResult, CjsModuleSourcePassesResult} from './types/visitor-passes.js'
 * @import {ModuleSourceRecord, CjsModuleSourceRecord} from './types/module-source.js'
 */

import makeModulePlugins from './babel-plugin.js';
import makeCjsModulePlugins from './cjs-babel-plugin.js';
import {
  createSourceOptions,
  createCjsSourceOptions,
} from './source-options.js';
import { buildFunctorSource, buildModuleRecord } from './functor.js';
import { buildCjsFunctorSource, buildCjsModuleRecord } from './cjs-functor.js';
import { visitorFromPlugin } from './plugin-util.js';

/**
 * Creates paired analyzer and transform visitor passes for module-source
 * analysis, plus a `buildRecord` function that constructs the final module
 * record from generated code.
 *
 * Must be called once per module to get fresh state. The returned analyzer and
 * transform passes share internal state and must be used in order: analyzer
 * first, then transform.
 *
 * @param {object} [options]
 * @param {boolean} [options.allowHidden] - Allow hidden identifier usage.
 * @returns {ModuleSourcePassesResult}
 */
export const createModuleSourcePasses = (options = {}) => {
  const { allowHidden = false } = options;

  const sourceOptions = createSourceOptions({ allowHidden });

  const { analyzePlugin, transformPlugin } = makeModulePlugins(sourceOptions);

  const analyzerPass = {
    visitor: visitorFromPlugin(analyzePlugin),
    getResults() {
      const { keys, values } = Object;
      return {
        imports: keys(sourceOptions.imports),
        exports: [
          ...keys(sourceOptions.liveExportMap),
          ...keys(sourceOptions.fixedExportMap),
          ...values(sourceOptions.reexportMap)
            .flat()
            .map(([_, exportName]) => exportName),
        ].sort(),
        reexports: [...sourceOptions.exportAlls].sort(),
        liveExportMap: sourceOptions.liveExportMap,
        fixedExportMap: sourceOptions.fixedExportMap,
        reexportMap: sourceOptions.reexportMap,
        needsImport: sourceOptions.dynamicImport.present,
        needsImportMeta: sourceOptions.importMeta.present,
      };
    },
  };

  const transformPass = {
    visitor: visitorFromPlugin(transformPlugin),
  };

  /**
   * Constructs a `ModuleSource`-compatible record from the generated code and
   * the analysis state accumulated during the analyzer and transform passes.
   *
   * @param {string} source - The code produced by `@babel/generator`
   *   after all transform passes.
   * @param {string} location - The source URL for the module.
   * @returns {ModuleSourceRecord} A `ModuleSource`-compatible object
   */
  const buildRecord = (source, location) => {
    const functorSource = buildFunctorSource(source, sourceOptions, location);
    return buildModuleRecord(sourceOptions, functorSource);
  };

  return { analyzerPass, transformPass, buildRecord };
};

/**
 * Creates paired analyzer and transform visitor passes for CJS module-source
 * analysis, plus a `buildRecord` function that constructs the final CJS module
 * record from generated code.
 *
 * Must be called once per module to get fresh state. The returned analyzer and
 * transform passes share internal state and must be used in order: analyzer
 * first, then transform.
 *
 * @param {object} [options]
 * @param {boolean} [options.allowHidden] - Allow hidden identifier usage.
 * @returns {CjsModuleSourcePassesResult}
 */
export const createCjsModuleSourcePasses = (options = {}) => {
  const { allowHidden = false } = options;

  const sourceOptions = createCjsSourceOptions({ allowHidden });

  const { analyzePlugin, transformPlugin } =
    makeCjsModulePlugins(sourceOptions);

  const analyzerPass = {
    visitor: visitorFromPlugin(analyzePlugin),
    getResults() {
      return {
        requires: [...sourceOptions.requires],
        exports: [...sourceOptions.exports].filter(
          name => !sourceOptions.unsafeGetters.has(name),
        ),
        reexports: [...sourceOptions.reexports],
        imports: [...sourceOptions.imports],
        needsImport: sourceOptions.dynamicImport.present,
      };
    },
  };

  const transformPass = {
    visitor: visitorFromPlugin(transformPlugin),
  };

  /**
   * Constructs a `CjsModuleSourceRecord` from the generated code and the
   * analysis state accumulated during the analyzer and transform passes.
   *
   * @param {string} source - The code produced by `@babel/generator`
   *   after all transform passes.
   * @param {string} location - The source URL for the module.
   * @returns {CjsModuleSourceRecord}
   */
  const buildRecord = (source, location) => {
    const functorSource = buildCjsFunctorSource(
      source,
      sourceOptions,
      location,
    );
    return buildCjsModuleRecord(sourceOptions, functorSource);
  };

  return { analyzerPass, transformPass, buildRecord };
};
