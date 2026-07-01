/**
 * Composes the CJS Babel plugin with the parse/traverse/generate cycle and
 * the CJS functor builder.
 *
 * Parallel to {@link makeModuleAnalyzer} for ESM.
 *
 * @module
 */

import { generate as generateBabel } from '@babel/generator';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { makeCjsModuleAnalysisContext } from './cjs-analyzer.js';

/**
 * @import {ModuleSourceOptions} from './types/module-source.js'
 * @import {CjsModuleSourceRecord} from './types/cjs-module-source.js'
 * @import {AnalysisOptions} from './types/analyzer.js'
 */

const { default: traverseBabel } = babelTraverse;

/**
 * Creates a CJS module analyzer function. Call the returned function with CJS
 * source to get a frozen `CjsModuleSourceRecord`.
 *
 * @returns {(source: string, options?: ModuleSourceOptions & AnalysisOptions) => CjsModuleSourceRecord}
 */
export const makeCjsAnalyzer = () => {
  /**
   * @param {string} moduleSource
   * @param {ModuleSourceOptions & AnalysisOptions} [options]
   */
  return function analyzeFromCjsSource(
    moduleSource,
    { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook, allowHidden } = {},
  ) {
    const ctx = makeCjsModuleAnalysisContext({ allowHidden });

    if (moduleSource.startsWith('#!')) {
      moduleSource = `//${moduleSource}`;
    }

    let scriptSource;
    try {
      const ast = parseBabel(moduleSource, {
        sourceType: 'commonjs',
        tokens: true,
        createParenthesizedExpressions: true,
      });

      traverseBabel(ast, ctx.analyzePass.visitor);
      traverseBabel(ast, ctx.transformPass.visitor);

      const { code: transformedSource, map: transformedSourceMap } =
        generateBabel(
          ast,
          {
            sourceFileName: sourceMapUrl,
            sourceMaps: !!sourceMapHook,
            // @ts-expect-error - undocumented option
            inputSourceMap: sourceMap,
            experimental_preserveFormat: true,
            preserveFormat: true,
            retainLines: true,
            verbatim: true,
          },
          moduleSource,
        );

      if (sourceMapHook && transformedSourceMap) {
        sourceMapHook(transformedSourceMap, {
          sourceUrl,
          sourceMapUrl,
          source: moduleSource,
        });
      }

      scriptSource = transformedSource;
    } catch (err) {
      const moduleLocation = sourceUrl
        ? JSON.stringify(sourceUrl)
        : '<unknown>';
      throw SyntaxError(
        `Error transforming CJS source in ${moduleLocation}: ${/** @type {Error} */ (err).message}`,
        { cause: err },
      );
    }

    return ctx.buildRecord(scriptSource, sourceUrl);
  };
};
