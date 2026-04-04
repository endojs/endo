// @ts-nocheck XXX Babel types
import { makeTransformSource } from './transform-source.js';
import makeModulePlugins from './babel-plugin.js';

import * as h from './hidden.js';
import { createSourceOptions } from './source-options.js';
import { buildFunctorSource, buildModuleRecord } from './functor.js';

/** @import {Options} from './module-source.js' */

const makeCreateStaticRecord = transformSource =>
  /**
   *
   * @param {string} moduleSource
   * @param {Options} options
   */
  function createStaticRecord(
    moduleSource,
    { sourceUrl, sourceMapUrl, sourceMap, sourceMapHook } = {},
  ) {
    const sourceOptions = createSourceOptions({
      sourceUrl,
      sourceMap,
      sourceMapUrl,
      sourceMapHook,
    });

    if (moduleSource.startsWith('#!')) {
      // Comment out the shebang lines.
      moduleSource = `//${moduleSource}`;
    }
    let scriptSource;
    try {
      scriptSource = transformSource(moduleSource, sourceOptions);
    } catch (err) {
      const moduleLocation = sourceUrl
        ? JSON.stringify(sourceUrl)
        : '<unknown>';
      throw SyntaxError(
        `Error transforming source in ${moduleLocation}: ${err.message}`,
        { cause: err },
      );
    }

    const functorSource = buildFunctorSource(
      scriptSource,
      sourceOptions,
      sourceUrl,
    );

    return buildModuleRecord(sourceOptions, functorSource);
  };

export const makeModuleAnalyzer = () => {
  const transformSource = makeTransformSource(makeModulePlugins);
  return makeCreateStaticRecord(transformSource);
};

// TODO: May be unused; referenced only in ses/test262
export const makeModuleTransformer = (_babel, importer) => {
  const transformSource = makeTransformSource(makeModulePlugins);
  const createStaticRecord = makeCreateStaticRecord(transformSource);
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
