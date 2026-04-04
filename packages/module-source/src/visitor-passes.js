/**
 * Provides {@link createModuleSourcePasses}, which creates paired analyzer and
 * transform visitor passes for use with `@endo/parser-pipeline`.
 *
 * @module
 */

/**
 * @import {ModuleSourcePassesResult} from './types/visitor-passes.js'
 * @import {ModuleSourceRecord} from './types/module-source.js'
 */

import makeModulePlugins from './babel-plugin.js';
import { createSourceOptions, visitorFromPlugin } from './source-options.js';
import { buildFunctorSource, buildModuleRecord } from './functor.js';

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

  // @ts-ignore XXX Babel types
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
   * @param {string} scriptSource - The code produced by `@babel/generator`
   *   after all transform passes.
   * @param {string} [sourceUrl] - The source URL for the module.
   * @returns {ModuleSourceRecord} A record compatible with `ModuleSource`.
   */
  const buildRecord = (scriptSource, sourceUrl) => {
    const functorSource = buildFunctorSource(
      scriptSource,
      sourceOptions,
      sourceUrl,
    );
    return buildModuleRecord(sourceOptions, functorSource);
  };

  return { analyzerPass, transformPass, buildRecord };
};
