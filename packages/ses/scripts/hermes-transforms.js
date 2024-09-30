/* eslint-disable import/no-extraneous-dependencies */
import { parse } from '@babel/parser';
import babelGenerate from '@agoric/babel-generator';
import babelTraverse from '@babel/traverse';
import * as t from '@babel/types';

// TODO The following is sufficient on Node.js, but for compatibility with
// `node -r esm`, we must use the pattern below.
// Remove after https://github.com/Agoric/agoric-sdk/issues/8671.
// OR, upgrading to Babel 8 probably addresses this defect.
const traverse = babelTraverse.default || babelTraverse;
const generate = babelGenerate.default || babelGenerate;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const asyncArrowEliminator = {
  ArrowFunctionExpression(path) {
    if (path.node.async) {
      let body = path.node.body;

      path.traverse({
        ThisExpression(innerPath) {
          const { start } = innerPath.node.loc;
          // throw path.buildCodeFrameError("..."); // https://github.com/babel/babel/issues/8617
          throw Error(
            `Hermes makeBundle Babel transform doesn't support 'this' keyword in async arrow functions.
    at this (${path.state.filename}:${start.line}:${start.column})`,
          );
        },
        // No need for an Identifier traversal on nodes matching 'arguments' to error on
        // Since only non-arrow functions can access the `arguments` array-like object
      });

      // In case it's a ()=>expression style arrow function
      if (!t.isBlockStatement(body)) {
        body = t.blockStatement([t.returnStatement(body)]);
      }

      const functionExpression = t.functionExpression(
        undefined,
        path.node.params,
        body,
        path.node.generator,
        path.node.async,
      );

      path.replaceWith(functionExpression);
    }
  },
};

export const hermesTransforms = {
  mjs: async (
    sourceBytes,
    specifier,
    location,
    _packageLocation,
    { sourceMap },
  ) => {
    const transforms = {
      ...asyncArrowEliminator,
      // Some transforms might be added based on the specifier later
    };

    const sourceString = decoder.decode(sourceBytes);

    const ast = parse(sourceString, {
      sourceType: 'module',
    });

    traverse(ast, transforms, undefined, { filename: location });

    const { code } = generate(ast, {
      // Nothing being done with sourcemaps as this point
      retainLines: true,
      compact: true,
      verbatim: true,
    });

    return { bytes: encoder.encode(code), parser: 'mjs', sourceMap };
  },
};
