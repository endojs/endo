import * as babelParser from '@babel/parser';
import babelGenerate from '@agoric/babel-generator';
import babelTraverse from '@babel/traverse';
import babelTypes from '@babel/types';

const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

const visitorFromPlugin = plugin => plugin({ types: babelTypes }).visitor;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

export const makeTransformSource = (makeModulePlugins, babel = null) => {
  if (babel !== null) {
    throw new Error(
      `transform-analyze.js no longer allows injecting babel; use \`null\``,
    );
  }

  const transformSource = (code, sourceOptions = {}) => {
    const { analyzePlugin, transformPlugin } = makeModulePlugins(sourceOptions);

    const ast = parseBabel(code, { sourceType: sourceOptions.sourceType });

    traverseBabel(ast, visitorFromPlugin(analyzePlugin));
    traverseBabel(ast, visitorFromPlugin(transformPlugin));

    const { code: transformedCode } = generateBabel(ast, {
      retainLines: true,
      compact: true,
      verbatim: true,
    });
    return transformedCode;
  };

  return transformSource;
};
