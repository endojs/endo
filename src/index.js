import { makeLinkedInstance } from './helpers';

const HIDDEN_PREFIX = '$h\u200d_';
const HIDDEN_IMPORT = `${HIDDEN_PREFIX}import`;
const HIDDEN_IMPORTS = `${HIDDEN_PREFIX}imports`;
const HIDDEN_ONCE = `${HIDDEN_PREFIX}once`;
const HIDDEN_LIVE = `${HIDDEN_PREFIX}live`;
const HIDDEN_SYMBOLS = [
  HIDDEN_IMPORT,
  HIDDEN_IMPORTS,
  HIDDEN_ONCE,
  HIDDEN_LIVE,
];

const makeModulePlugin = options =>
  function rewriteModules({ types: t }) {
    const visitor = {
      Identifier(path) {
        if (options.allowHidden) {
          return;
        }
        // Ensure the parse doesn't already include our required hidden symbols.
        // console.log(`have identifier`, path.node);
        const i = HIDDEN_SYMBOLS.indexOf(path.node.name);
        if (i >= 0) {
          throw path.buildCodeFrameError(
            `The ${HIDDEN_SYMBOLS[i]} identifier is reserved`,
          );
        }
      },
      CallExpression: {
        exit(path) {
          // import(FOO) -> $h_import(importHandle)(FOO)
          if (path.node.callee.type === 'Import') {
            options.importHandleUsed = true;
            path.node.callee = t.callExpression(t.identifier(HIDDEN_IMPORT), [
              t.numericLiteral(options.importHandle),
            ]);
          }
        },
      },
    };

    const moduleVisitor = {
      // FIXME: Handle all the import and export productions.
      ExportDefaultDeclaration: {
        exit(path) {
          // export default FOO -> $h_once.default(FOO)
          const callee = t.memberExpression(
            t.identifier(HIDDEN_ONCE),
            t.identifier('default'),
          );
          path.node = t.callExpression(callee, [path.node.declaration]);
        },
      },
      ImportNamespaceSpecifier(path) {
        throw path.buildCodeFrameError(`"import *" is not yet implemented`);
      },
      ImportDefaultSpecifier(path) {
        throw path.buildCodeFrameError(
          `"import default" is not yet implemented`,
        );
      },
      ImportSpecifier(path) {
        throw path.buildCodeFrameError(`"import {}" is not yet implemented`);
      },
    };

    if (options.sourceType === 'module') {
      // Add the module visitor.
      options.importHandleUsed = true;
      Object.assign(visitor, moduleVisitor);
    }
    return { visitor };
  };

const makeModuleTransformer = babelCore => {
  const staticModuleMap = new Map();

  function createStaticRecord(moduleSource) {
    const imports = {};
    const liveExportMap = {};
    const fixedExports = [];

    // FIXME: Parse the moduleSource.
    console.log(`would parse`, moduleSource);
    fixedExports.push('default');
    const functorSource = `(${function module($h‍_imports, $h‍_once, $h‍_live) {
      'use strict';

      $h‍_imports({});
      $h‍_once.default('foo');
    }})`;

    const moduleStaticRecord = {
      moduleSource,
      imports,
      liveExportMap,
      fixedExports,
      functorSource,
    };
    return moduleStaticRecord;
  }

  function makeAsyncLoader(counter, loader, moduleMapper) {
    return function loadOne(base, specifier) {
      let msr = staticModuleMap.get(specifier);
      if (msr) {
        // Loading in progress, or already a module static record.
        return Promise.resolve(msr);
      }

      // Begin the recursive load.
      counter(+1);
      const p = loader(specifier)
        .then(([depBase, depSource]) => {
          msr = createStaticRecord(depSource);
          staticModuleMap.set(specifier, msr);
          return Promise.all(
            Object.keys(msr.imports).map(depMod =>
              loadOne(depBase, moduleMapper(depBase, depMod)),
            ),
          );
        })
        .then(() => counter(-1));
      staticModuleMap.set(specifier, p);
      return p;
    };
  }

  let nextImportHandle = 0;
  const handleData = {};
  return {
    endow(es) {
      // Add the $h_import hidden endowment.
      return {
        ...es,
        endowments: {
          ...es.endowments,
          [HIDDEN_IMPORT](importHandle) {
            const {
              evaluatorAllowHidden,
              url: baseUrl,
              moduleMapper,
              loader,
            } = handleData[importHandle];
            const importExpr = baseMod => {
              let resolveImport;
              let rejectImport;
              let baseSpecifier;
              const importP = new Promise((resolve, reject) => {
                resolveImport = resolve;
                rejectImport = reject;
              });

              // The only async step is actually to load the sources.
              let todo = 0;
              function counter(delta) {
                todo += delta;
                if (todo === 0) {
                  // Do the synchronous linkage since all dependencies
                  // are resolved.
                  const li = makeLinkedInstance(
                    staticModuleMap,
                    baseSpecifier,
                    evaluatorAllowHidden,
                  );

                  // TODO: Maybe initialize in makeLinkedInstance?
                  li.initialize();
                  resolveImport(li.moduleNS);
                }
              }

              // Count up to prevent early return.
              counter(+1);
              const loadOne = makeAsyncLoader(counter, loader, moduleMapper);

              // Start loading the base specifier.
              baseSpecifier = moduleMapper(baseUrl, baseMod);
              loadOne(baseUrl, baseSpecifier).catch(rejectImport);

              // Count down in case there was nothing to load, so we can finish.
              counter(-1);
              return importP;
            };

            importExpr.meta = Object.create(null);
            importExpr.meta.url = baseUrl;
            return importExpr;
          },
        },
      };
    },
    rewrite(ss) {
      // Transform the source.
      const {
        allowHidden,
        evaluateProgram,
        moduleMapper: mapper,
        loader,
        url,
        src: source,
      } = ss;

      // Produce the Program or Expression source code.
      const sourceType = ss.sourceType === 'module' ? ss.sourceType : 'script';
      const parserPlugins = ['dynamicImport'];
      if (sourceType === 'module') {
        parserPlugins.push('importMeta');
      }

      // Keep the base URL for future imports.
      const importHandle = nextImportHandle;
      nextImportHandle += 1;

      const moduleOptions = {
        allowHidden,
        importHandle,
        importHandleUsed: false,
        sourceType,
      };

      const modulePlugin = makeModulePlugin(moduleOptions);
      const output = babelCore.transform(source, {
        parserOpts: {
          sourceType,
          plugins: parserPlugins,
        },
        plugins: [modulePlugin],
      });

      const moduleMapper = mapper || (mod => mod);

      if (moduleOptions.importHandleUsed) {
        const evaluatorAllowHidden = (src, endowments = {}, options = {}) =>
          evaluateProgram(src, endowments, { allowHidden: true, ...options });
        handleData[importHandle] = {
          evaluatorAllowHidden,
          url,
          moduleMapper,
          loader,
        };
      }

      if (sourceType === 'module') {
        return { ...ss, src: `throw Error('FIXME: modules not implemented')` };
      }

      // Work around Babel appending semicolons.
      const maybeSource = output.code;
      const actualSource =
        ss.sourceType === 'expression' &&
        maybeSource.endsWith(';') &&
        !source.endsWith(';')
          ? maybeSource.slice(0, -1)
          : maybeSource;

      // console.log(ss.isExpr, `generated`, src, `from`, ast);
      return { ...ss, src: actualSource };
    },
  };
};

export default makeModuleTransformer;
