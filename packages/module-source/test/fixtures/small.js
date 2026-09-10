/* eslint-disable */
console.error("This is a code sample for trying out babel transforms, it's not meant to be run");
import { generate as generateBabel } from '@babel/generator';
import { parse as babelParse } from '@babel/parser';
import traverseBabel from '@babel/traverse';

import makeModulePlugins from '../src/babel-plugin.js';

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
    });
    return transformedCode;
  };

  return transformSource;
};
