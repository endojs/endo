// @ts-nocheck XXX Babel types
import babelGenerate from '@babel/generator';
import babelTraverse from '@babel/traverse';
import * as babelTypes from '@babel/types';
import { babelParse } from './parse-babel.js';

const visitorFromPlugin = plugin => plugin({ types: babelTypes }).visitor;

const traverseBabel = babelTraverse.default || babelTraverse;
const generateBabel = babelGenerate.default || babelGenerate;

// `Hub` and `NodePath` are *named* exports of `@babel/traverse`, alongside
// the callable default `traverse` function.  Under the ESM/CJS interop shape
// where `babelTraverse.default` is the function, the named exports remain on
// the module namespace itself, so we read them from the namespace.
const { Hub: BabelHub, NodePath: BabelNodePath } = babelTraverse;

/**
 * Builds a synthetic `parentPath` carrying a Babel `Hub`.
 *
 * `traverse(ast, visitor)` initializes child paths with `hub === undefined`,
 * so any visitor that calls `path.buildCodeFrameError(...)` crashes with the
 * cryptic `Cannot read properties of undefined (reading 'buildError')`.
 * Threading a hub through a wrapper `parentPath` causes child paths to
 * inherit it (see `NodePath.get`: `if (!hub && parentPath) hub = parentPath.hub;`),
 * so error reporting from `path.buildCodeFrameError` produces the intended
 * `SyntaxError` instead.
 *
 * The wrapper holds the parsed `File` as its sole child, keyed `'container'`,
 * which mirrors how Babel's own compiler driver wires up the root path.
 *
 * @param {File} ast - the parsed Babel `File` node.
 * @returns {NodePath} a `NodePath` whose child paths inherit a `Hub`.
 */
const makeHubParentPath = ast => {
  const wrapper = { type: 'File', container: ast };
  return BabelNodePath.get({
    hub: new BabelHub(),
    parentPath: null,
    parent: wrapper,
    container: wrapper,
    key: 'container',
  });
};

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
    const { profileStartSpan } = sourceOptions;

    const endParse = profileStartSpan?.('moduleSource.babel.parse', {
      sourceType,
    });
    const ast = babelParse(source, {
      sourceType,
      tokens: true,
      createParenthesizedExpressions: true,
    });
    endParse?.();

    const endAnalyzeTraverse = profileStartSpan?.(
      'moduleSource.babel.traverseAnalyze',
    );
    // Each pass needs its own wrapper because `NodePath.get` caches paths
    // keyed on the `parent` node; reusing the same wrapper across passes
    // would let stale state from the analyze pass leak into transform.
    traverseBabel(
      ast,
      visitorFromPlugin(analyzePlugin),
      undefined,
      undefined,
      makeHubParentPath(ast),
    );
    endAnalyzeTraverse?.();
    const endTransformTraverse = profileStartSpan?.(
      'moduleSource.babel.traverseTransform',
    );
    traverseBabel(
      ast,
      visitorFromPlugin(transformPlugin),
      undefined,
      undefined,
      makeHubParentPath(ast),
    );
    endTransformTraverse?.();

    const sourceMaps = sourceOptions.sourceMapHook !== undefined;

    const endGenerate = profileStartSpan?.('moduleSource.babel.generate', {
      sourceMaps,
    });
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
    endGenerate?.();

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
