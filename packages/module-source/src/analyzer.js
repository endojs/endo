/**
 * Low-level module analysis primitives for ESM.
 *
 * {@link makeModuleAnalysisContext} returns a per-parse context object
 * holding plain `{ visitor }` objects and a `buildRecord` function.
 *
 * Consumers are responsible for:
 * 1. Traversing the AST with `ctx.analyzePass.visitor`.
 * 2. Traversing the (mutated) AST with `ctx.transformPass.visitor`.
 * 3. Generating code.
 * 4. Calling `ctx.buildRecord(code, location)` to produce the module record.
 *
 * @module
 */

/**
 * @import {ModuleAnalysisContext, AnalysisOptions} from './types/analyzer.js'
 */

import makeModulePlugins from './babel-plugin.js';
import { createSourceOptions } from './source-options.js';
import { buildFunctorSource, buildModuleRecord } from './functor.js';

/**
 * Creates a fresh ESM analysis context for a single module parse.
 *
 * @param {AnalysisOptions} [options]
 * @returns {ModuleAnalysisContext}
 */
export const makeModuleAnalysisContext = (options = {}) => {
  const { allowHidden = false } = options;
  const sourceOptions = createSourceOptions({ allowHidden });
  const { analyzePlugin, transformPlugin } = makeModulePlugins(sourceOptions);

  return {
    analyzePass: analyzePlugin,
    transformPass: transformPlugin,

    buildRecord(generatedCode, location) {
      const functorSource = buildFunctorSource(
        generatedCode,
        sourceOptions,
        location,
      );
      return buildModuleRecord(sourceOptions, functorSource);
    },
  };
};
