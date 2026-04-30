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
import { analyzeModule } from './analyzer.js';
import * as h from './hidden.js';

/**
 * @import {ModuleSourceOptions, ModuleSourceRecord} from './types/module-source.js'
 * @import {AnalysisOptions} from './types/analyzer.js'
 */

const { default: traverseBabel } = babelTraverse;

/**
 * Creates a module analyzer function. Call the returned function with ESM
 * source to get a frozen `ModuleSourceRecord`.
 *
 * @returns {(source: string, options?: ModuleSourceOptions & AnalysisOptions) => ModuleSourceRecord}
 */
export const makeModuleAnalyzer = () =>
  /**
   * @param {string} moduleSource
   * @param {ModuleSourceOptions & AnalysisOptions} [options]
   * @returns {ModuleSourceRecord}
   */
  function createStaticRecord(
    moduleSource,
    { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook, allowHidden } = {},
  ) {
    if (moduleSource.startsWith('#!')) {
      // Comment out the shebang lines.
      moduleSource = `//${moduleSource}`;
    }

    const ctx = analyzeModule({ allowHidden });

    let scriptSource;
    try {
      const ast = parseBabel(moduleSource, {
        sourceType: 'module',
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
            // @ts-expect-error undocumented option
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

// TODO: May be unused; referenced only in ses/test262
export const makeModuleTransformer = (_babel, importer) => {
  const createStaticRecord = makeModuleAnalyzer();

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
    const ctx = analyzeModule({ allowHidden });
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
      function curryImporter(srcSpec) {
        return importer(srcSpec, endowments);
      }

      // Create an import expression for the given URL.
      function makeImportExpr() {
        // TODO: Provide a way to allow hardening of the import expression.
        const importExpr = spec => curryImporter({ url, spec });
        importExpr.meta = Object.create(null);
        importExpr.meta.url = url;
        return importExpr;
      }

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
