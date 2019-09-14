import * as h from './hidden';
import makeModulePlugin from './babelPlugin';

const makeModuleTransformer = (babelCore, makeImporter) => {
  function transformSource(source, sourceOptions = {}) {
    // Transform the script/expression source for import expressions.
    const parserPlugins = ['dynamicImport'];
    if (sourceOptions.sourceType === 'module') {
      parserPlugins.push('importMeta');
    }

    // console.log(`transforming`, sourceOptions, source);
    const modulePlugin = makeModulePlugin(sourceOptions);
    const output = babelCore.transform(source, {
      parserOpts: {
        plugins: parserPlugins,
      },
      generatorOpts: {
        retainLines: true,
      },
      plugins: [modulePlugin],
    });

    // console.log(`transformed to`, output.code);
    return output.code;
  }

  function createStaticRecord(moduleSource) {
    // Transform the Module source code.
    const sourceOptions = {
      sourceType: 'module',
      fixedExports: [],
      imports: {},
      liveExportMap: {},
      hoistedDecls: [],
      importSources: {},
      importDecls: [],
    };
    const scriptSource = transformSource(moduleSource, sourceOptions);

    let preamble = sourceOptions.importDecls.join(',');
    if (preamble !== '') {
      preamble = `let ${preamble};`;
    }
    const js = JSON.stringify;
    const isrc = sourceOptions.importSources;
    preamble += `${h.HIDDEN_IMPORTS}({${Object.keys(isrc)
      .map(
        src =>
          `${js(src)}: ${Object.entries(isrc[src])
            .map(([exp, upds]) => `${js(exp)}: [${upds.join(',')}]`)
            .join(',')}`,
      )
      .join(',')}});`;
    preamble += sourceOptions.hoistedDecls
      .map(vname => `${h.HIDDEN_LIVE}.${vname}();`)
      .join('');

    // The functor captures the SES `arguments`, which is definitely
    // less bad than the functor's arguments (which we are trying to
    // hide.
    //
    // It must also be strict to enforce strictness of modules.
    // We use destructuring parameters, so 'use strict' is not allowed
    // but the function actually is strict.
    const functorSource = `\
(({${h.HIDDEN_IMPORT}, ${h.HIDDEN_IMPORTS}, ${h.HIDDEN_ONCE}, ${h.HIDDEN_LIVE}}) => { \
  ${preamble} \
  ${scriptSource}
})`;

    const moduleStaticRecord = {
      moduleSource,
      imports: sourceOptions.imports,
      liveExportMap: sourceOptions.liveExportMap,
      fixedExports: sourceOptions.fixedExports,
      functorSource,
    };
    return moduleStaticRecord;
  }

  return {
    rewrite(ss) {
      // Transform the source into evaluable form.
      const { allowHidden, evaluateProgram, endowments, src: source, url } = ss;

      // Make an importer that uses our transform for its submodules.
      function curryImporter(srcSpec) {
        const evaluate = (src, postEndowments = {}) => {
          const endow = Object.create(null, {
            ...Object.getOwnPropertyDescriptors(endowments),
            ...Object.getOwnPropertyDescriptors(postEndowments),
          });
          return evaluateProgram(src, endow, { allowHidden: true });
        };
        return makeImporter(srcSpec, createStaticRecord, evaluate);
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
        // Import our own source directly, returning a promise.
        Object.assign(endowments, {
          [h.HIDDEN_IMPORT_SELF]: curryImporter({ url, source }),
        });
        return {
          ...ss,
          endowments,
          allowHidden: true,
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

      // console.log(ss.isExpr, `generated`, src, `from`, ast);
      return { ...ss, endowments, src: actualSource };
    },
  };
};

export default makeModuleTransformer;
