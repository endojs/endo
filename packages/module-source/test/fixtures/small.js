/* eslint-disable */
console.error("This is a code sample for trying out babel transforms, it's not meant to be run");
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';

import makeModulePlugins from '../src/babel-plugin.js';

const parseBabel = babelParser.default
  ? babelParser.default.parse
  : babelParser.parse || babelParser;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

export const makeTransformSource = () => {
  const transformSource = (code, sourceOptions = {}) => {
    // console.log(`transforming`, sourceOptions, code);
    const { analyzePlugin, transformPlugin } = makeModulePlugins(sourceOptions);

    const ast = babelParse(code, { sourceType: sourceOptions.sourceType });

    traverseBabel(ast, analyzePlugin.visitor);
    traverseBabel(ast, transformPlugin.visitor);

    const { code: transformedCode } = generateBabel(ast, {
      retainLines: true,
      compact: true,
      verbatim: true,
    });
    return transformedCode;
  };

  return transformSource;
};
