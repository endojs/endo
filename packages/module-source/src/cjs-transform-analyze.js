/**
 * Composes the CJS Babel plugin with the parse/traverse/generate cycle and
 * the CJS functor builder.
 *
 * Parallel to {@link transform-analyze.js} for ESM.
 *
 * @module
 */

import * as babelParser from '@babel/parser';
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';

import makeCjsModulePlugins from './cjs-babel-plugin.js';
import { createCjsSourceOptions, visitorFromPlugin } from './source-options.js';
import { buildCjsFunctorSource, buildCjsModuleRecord } from './cjs-functor.js';

/**
 * @import {ModuleSourceOptions, CjsModuleSourceRecord} from './types/module-source.js'
 */

const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

/**
 * Creates a CJS module analyzer function. Call the returned function with CJS
 * source to get a frozen `CjsModuleSourceRecord`.
 *
 * @returns {(source: string, options?: ModuleSourceOptions) => CjsModuleSourceRecord}
 */
export const makeCjsAnalyzer = () => {
  /**
   * @param {string} moduleSource
   * @param {ModuleSourceOptions} [options]
   */
  return function analyzeCjs(
    moduleSource,
    { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook } = {},
  ) {
    const sourceOptions = createCjsSourceOptions({
      sourceUrl,
      sourceMap,
      sourceMapUrl,
      sourceMapHook,
    });

    if (moduleSource.startsWith('#!')) {
      moduleSource = `//${moduleSource}`;
    }

    let scriptSource;
    try {
      const { analyzePlugin, transformPlugin } =
        makeCjsModulePlugins(sourceOptions);

      const ast = parseBabel(moduleSource, {
        sourceType: 'commonjs',
        tokens: true,
        createParenthesizedExpressions: true,
      });

      traverseBabel(ast, visitorFromPlugin(analyzePlugin));
      traverseBabel(ast, visitorFromPlugin(transformPlugin));

      const { code: transformedSource, map: transformedSourceMap } =
        generateBabel(
          ast,
          {
            sourceFileName: sourceMapUrl,
            sourceMaps: !!sourceMapHook,
            // @ts-expect-error undocumented
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
        `Error transforming CJS source in ${moduleLocation}: ${err.message}`,
        { cause: err },
      );
    }

    const functorSource = buildCjsFunctorSource(
      scriptSource,
      sourceOptions,
      sourceUrl,
    );

    return buildCjsModuleRecord(sourceOptions, functorSource);
  };
};
