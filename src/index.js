/* eslint-disable prefer-destructuring */
import * as h from './hidden';
import makeModulePlugins from './babelPlugin';

const makeModuleTransformer = (babelCore, importer) => {
  function transformSource(source, sourceOptions = {}) {
    // Transform the script/expression source for import expressions.
    const parserPlugins = [];
    if (sourceOptions.sourceType === 'module') {
      parserPlugins.push(
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'importMeta',
      );
    }

    // This list taken and amended from:
    // https://github.com/prettier/prettier/tree/master/src/language-js/parser-babylon.js#L21
    parserPlugins.push(
      'eventualSend',
      'doExpressions',
      'objectRestSpread',
      'classProperties',
      // 'exportDefaultFrom', // only for modules, above
      // 'exportNamespaceFrom', // only for modules, above
      'asyncGenerators',
      'functionBind',
      'functionSent',
      'dynamicImport', // needed for our rewrite
      'numericSeparator',
      // 'importMeta', // only for modules, above
      'optionalCatchBinding',
      'optionalChaining',
      'classPrivateProperties',
      ['pipelineOperator', { proposal: 'minimal' }],
      'nullishCoalescingOperator',
      'bigInt',
      'throwExpressions',
      'logicalAssignment',
      'classPrivateMethods',
      // 'v8intrinsic', // we really don't want people to rely on platform powers
      'partialApplication',
      ['decorators', { decoratorsBeforeExport: false }],
    );

    // console.log(`transforming`, sourceOptions, source);
    const modulePlugins = makeModulePlugins(sourceOptions);
    const output = babelCore.transformSync(source, {
      parserOpts: {
        allowAwaitOutsideFunction: true,
        allowImportExportEverywhere: true,
        plugins: parserPlugins,
      },
      generatorOpts: {
        retainLines: true,
      },
      plugins: [modulePlugins[0]],
      ast: true,
      code: modulePlugins.length === 1,
    });
    let { ast, code } = output;
    for (let i = 1; i < modulePlugins.length - 1; i += 1) {
      const middleOut = babelCore.transformFromAstSync(ast, source, {
        plugins: [modulePlugins[i]],
        ast: true,
        code: false,
      });
      ast = middleOut.ast;
    }
    if (modulePlugins.length > 1) {
      const finalOut = babelCore.transformFromAstSync(ast, source, {
        generatorOpts: {
          retainLines: true,
        },
        plugins: [modulePlugins[modulePlugins.length - 1]],
      });
      code = finalOut.code;
    }

    // console.log(`transformed to`, output.code);
    return code;
  }

  function createStaticRecord(moduleSource) {
    // Transform the Module source code.
    const sourceOptions = {
      sourceType: 'module',
      // exportNames of variables that are only initialized and used, but
      // never assigned to.
      fixedExportMap: {},
      // Record of imported module specifier names to list of importNames.
      // The importName '*' is that module's module namespace object.
      imports: {},
      // List of module specifiers that we export all from.
      exportAlls: [],
      // exportNames of variables that are assigned to, or reexported and
      // therefore assumed live. A reexported variable might not have any
      // localName.
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
    preamble += `await ${h.HIDDEN_IMPORTS}(new Map([${Object.keys(isrc)
      .map(
        src =>
          `[${js(src)}, new Map([${Object.entries(isrc[src])
            .map(([exp, upds]) => `[${js(exp)}, [${upds.join(',')}]]`)
            .join(',')}])]`,
      )
      .join(',')}]), ${js(sourceOptions.exportAlls)});`;
    preamble += sourceOptions.hoistedDecls
      .map(([vname, cvname]) => `${h.HIDDEN_LIVE}.${vname}(${cvname || ''});`)
      .join('');

    // The functor captures the SES `arguments`, which is definitely
    // less bad than the functor's arguments (which we are trying to
    // hide.
    //
    // It must also be strict to enforce strictness of modules.
    // We use destructuring parameters, so 'use strict' is not allowed
    // but the function actually is strict.
    const functorSource = `\
(async ({ \
  imports: ${h.HIDDEN_IMPORTS}, \
  onceVar: ${h.HIDDEN_ONCE}, \
  liveVar: ${h.HIDDEN_LIVE}, \
 }) => { \
  ${preamble} \
  ${scriptSource}
})`;

    const moduleStaticRecord = {
      imports: sourceOptions.imports,
      liveExportMap: sourceOptions.liveExportMap,
      fixedExportMap: sourceOptions.fixedExportMap,
      functorSource,
    };
    // console.log(moduleStaticRecord);
    return moduleStaticRecord;
  }

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
        const staticRecord = createStaticRecord(source);
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

      // console.log(ss.isExpr, `generated`, src, `from`, ast);
      return { ...ss, endowments, src: actualSource };
    },
  };
};

export default makeModuleTransformer;
