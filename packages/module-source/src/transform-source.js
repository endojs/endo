// @ts-nocheck XXX Babel types
import * as babelParser from '@babel/parser';
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import * as babelTypes from '@babel/types';

const parseBabel =
  (typeof babelParser.parse === 'function' && babelParser.parse) ||
  (babelParser.default &&
    ((typeof babelParser.default.parse === 'function' &&
      babelParser.default.parse) ||
      (typeof babelParser.default === 'function' && babelParser.default))) ||
  (typeof babelParser === 'function' ? babelParser : undefined);

if (typeof parseBabel !== 'function') {
  throw Error('Unable to resolve @babel/parser parse function');
}

const visitorFromPlugin = plugin => plugin({ types: babelTypes }).visitor;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

export const makeTransformSource = (makeModulePlugins, babel = null) => {
  if (babel !== null) {
    throw Error(
      `transform-analyze.js no longer allows injecting babel; use \`null\``,
    );
  }

  const transformSource = (source, sourceOptions = {}) => {
    const { analyzePlugin, transformPlugin } = makeModulePlugins(sourceOptions);

    const { sourceUrl, sourceMapUrl, sourceType, sourceMap, sourceMapHook } =
      sourceOptions;

    const ast = parseBabel(source, {
      sourceType,
      tokens: true,
      createParenthesizedExpressions: true,
    });

    traverseBabel(ast, visitorFromPlugin(analyzePlugin));
    traverseBabel(ast, visitorFromPlugin(transformPlugin));

    const sourceMaps = sourceOptions.sourceMapHook !== undefined;

    const { code: transformedSource, map: transformedSourceMap } =
      generateBabel(
        ast,
        {
          sourceFileName: sourceMapUrl,
          sourceMaps,
          inputSourceMap: sourceMap,
          experimental_preserveFormat: true,
          preserveFormat: true,
          retainLines: true,
          verbatim: true,
        },
        source,
      );

    if (sourceMaps) {
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
