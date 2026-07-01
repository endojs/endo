/**
 * Composes the ESM Babel plugin with the parse/traverse/generate cycle and
 * the ESM functor builder.
 *
 * Parallel to {@link makeCjsAnalyzer} for CJS.
 *
 * @module
 */

import { generate as generateBabel } from '@babel/generator';
import { parse as parseBabel } from '@babel/parser';
import babelTraverse from '@babel/traverse';
import { makeModuleAnalysisContext } from './analyzer.js';
import * as h from './hidden.js';

/**
 * @import {ModuleSourceOptions, ModuleSourceRecord} from './types/module-source.js'
 * @import {AnalysisOptions} from './types/analyzer.js'
 * @import {ParseResult} from '@babel/parser'
 * @import {File} from '@babel/types'
 * @import {NodePath} from '@babel/traverse'
 */

// `Hub` and `NodePath` are *named* exports of `@babel/traverse`, alongside
// the callable default `traverse` function.  Under the ESM/CJS interop shape
// where `babelTraverse.default` is the function, the named exports remain on
// the module namespace itself, so we read them from the namespace.
const {
  default: traverseBabel,
  Hub: BabelHub,
  NodePath: BabelNodePath,
} = babelTraverse;

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
 * @param {ParseResult<File>} ast - the parsed Babel `File` node.
 * @returns {NodePath} a `NodePath` whose child paths inherit a `Hub`.
 */
const makeHubParentPath = ast => {
  const wrapper = { type: 'File', container: ast };
  // @ts-expect-error - XXX unsure
  return BabelNodePath.get({
    hub: new BabelHub(),
    parentPath: null,
    parent: wrapper,
    container: wrapper,
    key: 'container',
  });
};

/**
 * Creates a module analyzer function. Call the returned function with ESM
 * source to get a frozen `ModuleSourceRecord`.
 *
 * @returns {(source: string, options?: ModuleSourceOptions & AnalysisOptions) => ModuleSourceRecord}
 */
export const makeModuleSourceAnalyzer = () => {
  /**
   * @param {string} moduleSource
   * @param {ModuleSourceOptions & AnalysisOptions} [options]
   * @returns {ModuleSourceRecord}
   */
  const createStaticRecord = (
    moduleSource,
    { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook, allowHidden } = {},
  ) => {
    if (moduleSource.startsWith('#!')) {
      // Comment out the shebang lines.
      moduleSource = `//${moduleSource}`;
    }

    const ctx = makeModuleAnalysisContext({ allowHidden });

    let scriptSource;
    try {
      const ast = parseBabel(moduleSource, {
        sourceType: 'module',
        tokens: true,
        createParenthesizedExpressions: true,
      });

      traverseBabel(
        ast,
        ctx.analyzePass.visitor,
        undefined,
        undefined,
        makeHubParentPath(ast),
      );
      traverseBabel(
        ast,
        ctx.transformPass.visitor,
        undefined,
        undefined,
        makeHubParentPath(ast),
      );

      const { code: transformedSource, map: transformedSourceMap } =
        generateBabel(
          ast,
          {
            sourceFileName: sourceMapUrl,
            sourceMaps: !!sourceMapHook,
            // @ts-expect-error - unknown/undocumented option
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
        `Error transforming source in ${moduleLocation}: ${/** @type {Error} */ (err).message}`,
        { cause: err },
      );
    }

    return ctx.buildRecord(scriptSource, sourceUrl);
  };
  return createStaticRecord;
};

// TODO: May be unused; referenced only in ses/test262
export const makeModuleTransformer = (_babel, importer) => {
  const createStaticRecord = makeModuleSourceAnalyzer();

  /**
   * Transforms ESM or script source for evaluation in a compartment.
   * For the script/expression path we re-run a minimal parse+traverse+generate
   * to rewrite dynamic `import()` calls, mirroring what the analyze pass does.
   *
   * @param {string} source
   * @param {{ allowHidden?: boolean, sourceType?: string }} options
   * @returns {string}
   */
  const transformSource = (source, options = {}) => {
    const { allowHidden = false } = options;
    const ctx = makeModuleAnalysisContext({ allowHidden });
    const ast = parseBabel(source, {
      sourceType: 'script',
      tokens: true,
      createParenthesizedExpressions: true,
    });
    // Only run the transform pass (rewrites import() calls)
    traverseBabel(ast, ctx.transformPass.visitor);
    const { code } = generateBabel(ast, {}, source);
    return code;
  };

  return {
    rewrite(ss) {
      // Transform the source into evaluable form.
      const { allowHidden, endowments, src: source, url } = ss;

      // Make an importer that uses our transform for its submodules.
      const curryImporter = srcSpec => importer(srcSpec, endowments);

      // Create an import expression for the given URL.
      const makeImportExpr = () => {
        // TODO: Provide a way to allow hardening of the import expression.
        const importExpr = spec => curryImporter({ url, spec });
        importExpr.meta = Object.create(null);
        importExpr.meta.url = url;
        return importExpr;
      };

      // Add the $h_import hidden endowment for import expressions.
      Object.assign(endowments, {
        [h.HIDDEN_IMPORT]: makeImportExpr(),
      });

      if (ss.sourceType === 'module') {
        // Do the rewrite of our own sources.
        const staticRecord = createStaticRecord(source, url);
        Object.assign(endowments, {
          // Import our own source directly, returning a promise.
          [h.HIDDEN_IMPORT_SELF]: () => curryImporter({ url, staticRecord }),
        });
        return {
          ...ss,
          endowments,
          allowHidden: true,
          staticRecord,
          sourceType: 'script',
          src: `${h.HIDDEN_IMPORT_SELF}();`,
        };
      }

      // Transform the Script or Expression source code with import expression.
      const maybeSource = transformSource(source, {
        allowHidden,
        sourceType: 'script',
      });

      // Work around Babel appending semicolons.
      const actualSource =
        ss.sourceType === 'expression' &&
        maybeSource.endsWith(';') &&
        !source.endsWith(';')
          ? maybeSource.slice(0, -1)
          : maybeSource;

      return { ...ss, endowments, src: actualSource };
    },
  };
};
