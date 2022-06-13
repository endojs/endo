import { makeTransformSource } from './transformSource.js';
import makeModulePlugins from './babelPlugin.js';

import * as h from './hidden.js';

const { freeze } = Object;

const makeCreateStaticRecord = transformSource =>
  function createStaticRecord(moduleSource, url) {
    // Transform the Module source code.
    const sourceOptions = {
      sourceType: 'module',
      // exportNames of variables that are only initialized and used, but
      // never assigned to.
      fixedExportMap: Object.create(null),
      // Record of imported module specifier names to list of importNames.
      // The importName '*' is that module's module namespace object.
      imports: Object.create(null),
      // List of module specifiers that we export all from.
      exportAlls: [],
      // exportNames of variables that are assigned to, or reexported and
      // therefore assumed live. A reexported variable might not have any
      // localName.
      liveExportMap: Object.create(null),
      hoistedDecls: [],
      importSources: Object.create(null),
      importDecls: [],
      // enables passing import.meta usage hints up.
      importMeta: { present: false },
    };
    if (moduleSource.startsWith('#!')) {
      // Comment out the shebang lines.
      moduleSource = `//${moduleSource}`;
    }
    const scriptSource = transformSource(moduleSource, sourceOptions);

    let preamble = sourceOptions.importDecls.join(',');
    if (preamble !== '') {
      preamble = `let ${preamble};`;
    }
    const js = JSON.stringify;
    const isrc = sourceOptions.importSources;
    preamble += `${h.HIDDEN_IMPORTS}([${Object.keys(isrc)
      .map(
        src =>
          `[${js(src)}, [${Object.entries(isrc[src])
            .map(([exp, upds]) => `[${js(exp)}, [${upds.join(',')}]]`)
            .join(',')}]]`,
      )
      .join(',')}]);`;
    preamble += sourceOptions.hoistedDecls
      .map(([vname, isOnce, cvname]) => {
        let src = '';
        if (cvname) {
          // It's a function assigned to, so set its name property.
          src = `Object.defineProperty(${cvname}, 'name', {value: ${js(
            vname,
          )}});`;
        }
        const hDeclId = isOnce ? h.HIDDEN_ONCE : h.HIDDEN_LIVE;
        src += `${hDeclId}.${vname}(${cvname || ''});`;
        return src;
      })
      .join('');

    // The functor captures the SES `arguments`, which is definitely
    // less bad than the functor's arguments (which we are trying to
    // hide).
    //
    // It must also be strict to enforce strictness of modules.
    // We use destructuring parameters, so 'use strict' is not allowed
    // but the function actually is strict.
    let functorSource = `\
(({ \
  imports: ${h.HIDDEN_IMPORTS}, \
  liveVar: ${h.HIDDEN_LIVE}, \
  onceVar: ${h.HIDDEN_ONCE}, \
  importMeta: ${h.HIDDEN_META}, \
 }) => { \
  ${preamble} \
  ${scriptSource}
})
`;

    if (url) {
      functorSource += `//# sourceURL=${url}\n`;
    }
    const moduleAnalysis = freeze({
      exportAlls: freeze(sourceOptions.exportAlls),
      imports: freeze(sourceOptions.imports),
      liveExportMap: freeze(sourceOptions.liveExportMap),
      fixedExportMap: freeze(sourceOptions.fixedExportMap),
      needsImportMeta: sourceOptions.importMeta.present,
      functorSource,
    });
    return moduleAnalysis;
  };

export const makeModuleAnalyzer = babel => {
  const transformSource = makeTransformSource(makeModulePlugins, babel);
  const createStaticRecord = makeCreateStaticRecord(transformSource);
  return ({ string, url }) => createStaticRecord(string, url);
};

export const makeModuleTransformer = (babel, importer) => {
  const transformSource = makeTransformSource(makeModulePlugins, babel);
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
