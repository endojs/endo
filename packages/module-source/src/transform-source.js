import * as babelParser from '@babel/parser';
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';

import { visitorFromPlugin } from './source-options.js';

/**
 * @import {PluginFactory, TransformSourceParams} from './types/module-source.js'
 */

const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

/**
 * Creates a transform source function.
 *
 * @param {(options: TransformSourceParams) => {analyzePlugin: PluginFactory, transformPlugin: PluginFactory}} makeModulePlugins
 * @param {null} [babel]
 * @returns {(source: string, options: TransformSourceParams) => string}
 */
export const makeTransformSource = (makeModulePlugins, babel = null) => {
  if (babel !== null) {
    throw Error(
      `transform-analyze.js no longer allows injecting babel; use \`null\``,
    );
  }

  /**
   * Transforms the source code into a form that can be evaluated.
   *
   * @param {string} source
   * @param {TransformSourceParams} options
   * @returns {string}
   */
  const transformSource = (source, options) => {
    const { analyzePlugin, transformPlugin } = makeModulePlugins(options);

    const { sourceUrl, sourceMapUrl, sourceType, sourceMap, sourceMapHook } =
      options;

    const ast = parseBabel(source, {
      sourceType,
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
          // @ts-expect-error undocumented option
          inputSourceMap: sourceMap,
          experimental_preserveFormat: true,
          preserveFormat: true,
          retainLines: true,
          verbatim: true,
        },
        source,
      );

    if (sourceMapHook && transformedSourceMap) {
      sourceMapHook(transformedSourceMap, {
        sourceUrl,
        sourceMapUrl,
        source,
      });
    }

    return transformedSource;
  };

  return transformSource;
};
