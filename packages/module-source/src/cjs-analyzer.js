/**
 * Low-level module analysis primitives for CJS.
 *
 * {@link makeCjsModuleAnalysisContext} returns a per-parse context object
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

import makeCjsModulePlugins from './cjs-babel-plugin.js';
import { buildCjsFunctorSource, buildCjsModuleRecord } from './cjs-functor.js';
import { createCjsSourceOptions } from './source-options.js';

/**
 * @import {AnalysisOptions} from './types/analyzer.js'
 * @import {CjsAnalysisContext} from './types/cjs-analyzer.js'
 */

/**
 * Creates a fresh CJS analysis context for a single module parse.
 *
 * @param {AnalysisOptions} [options]
 * @returns {CjsAnalysisContext}
 */

export const makeCjsModuleAnalysisContext = (options = {}) => {
  const { allowHidden = false } = options;
  const sourceOptions = createCjsSourceOptions({ allowHidden });
  const { analyzePlugin, transformPlugin } =
    makeCjsModulePlugins(sourceOptions);

  return {
    analyzePass: analyzePlugin,
    transformPass: transformPlugin,

    buildRecord(generatedCode, location) {
      const functorSource = buildCjsFunctorSource(
        generatedCode,
        sourceOptions,
        location,
      );
      return buildCjsModuleRecord(sourceOptions, functorSource);
    },
  };
};
