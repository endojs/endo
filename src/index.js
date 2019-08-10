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
    const { fixedExports, liveExportMap } = options;
    const hiddenIdentifier = h => {
      const ident = t.identifier(h);
      ident.agoricInternal = true;
      return ident;
    };
    const visitor = {
      Identifier(path) {
        if (options.allowHidden || path.node.agoricInternal) {
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
      CallExpression(path) {
        // import(FOO) -> $h_import(importHandle)(FOO)
        if (path.node.callee.type === 'Import') {
          options.importHandleUsed = true;
          path.node.callee = t.callExpression(hiddenIdentifier(HIDDEN_IMPORT), [
            t.numericLiteral(options.importHandle),
          ]);
        }
      },
    };

    const moduleVisitor = {
      // FIXME: Handle all the import and export productions.
      ExportDefaultDeclaration(path) {
        // export default FOO -> $h_once.default(FOO)
        fixedExports.push('default');
        const callee = t.memberExpression(
          hiddenIdentifier(HIDDEN_ONCE),
          t.identifier('default'),
        );
        path.replaceWith(t.callExpression(callee, [path.node.declaration]));
      },
      ExportNamedDeclaration(path) {
        const decl = path.node.declaration;
        const specs = path.node.specifiers;
        const replace = [];
        if (decl) {
          const collectPatternIdentifiers = pattern => {
            if (pattern === null) {
              // Elided array element.
              return [];
            }
            switch (pattern.type) {
              case 'Identifier':
                return [pattern];
              case 'ObjectPattern':
                return pattern.properties.reduce((prior, { value }) => {
                  prior.push(...collectPatternIdentifiers(value));
                  return prior;
                }, []);
              case 'ArrayPattern':
                return pattern.elements.reduce((prior, pat) => {
                  prior.push(...collectPatternIdentifiers(pat));
                  return prior;
                }, []);
              default:
                throw path.buildCodeFrameError(
                  `Pattern type ${pattern.type} is not recognized`,
                );
            }
          };

          // Find all the declared variable identifiers.
          const vids = (decl.declarations || [decl]).reduce(
            (prior, { id: pat }) => {
              prior.push(...collectPatternIdentifiers(pat));
              return prior;
            },
            [],
          );
          const vnames = vids.map(({ name }) => name);

          // TODO: Detect if a non-const declaration is actually fixed
          // (no other assignments to it).
          const isLive = decl.kind !== 'const';
          if (isLive) {
            // These exports may potentially change.
            vnames.forEach(vname => (liveExportMap[vname] = [vname]));
          } else {
            // Fixed exports (i.e. const or non-mutated)
            fixedExports.push(...vnames);
          }

          // Create the export calls.
          const exportFname = hiddenIdentifier(
            isLive ? HIDDEN_LIVE : HIDDEN_ONCE,
          );
          const exportCalls = vids.map(id =>
            t.expressionStatement(
              t.callExpression(t.memberExpression(exportFname, id), [id]),
            ),
          );

          let rewriteKind;
          if (decl.type === 'FunctionDeclaration') {
            // Hoist the name, and rewrite as an IIFE.
            options.hoistedDecls.push(...vnames);
            rewriteKind = 'function';
          } else if (decl.kind === 'var') {
            // Save the hoistedDecls so that we don't have a
            // temporal dead zone for them.
            options.hoistedDecls.push(...vnames);

            // Use a let declaration in our rewrite.
            rewriteKind = 'let';
          } else {
            rewriteKind = decl.kind;
          }

          switch (rewriteKind) {
            case 'const':
              // Just put the declaration and export calls next to each other.
              // This optimizes by shadowing the endowed proxy trap.
              replace.push(decl, ...exportCalls);
              break;
            case 'let':
              // Replace with a block so that the let declarations
              // don't shadow the endowed proxy trap.
              replace.push(
                t.blockStatement([
                  // The let declaration,
                  { ...decl, kind: rewriteKind },
                  // all the export calls,
                  ...exportCalls,
                ]),
              );
              break;

            case 'function':
              // Replace with an IIFE to preserve the function
              // semantics without shadowing the endowed proxy trap.
              replace.push(
                t.expressionStatement(
                  t.callExpression(
                    t.arrowFunctionExpression(
                      [], // no params
                      t.blockStatement([
                        // The function declaration.
                        decl,
                        // all the export calls,
                        ...exportCalls,
                      ]),
                    ),
                    [], // no args
                  ),
                ),
              );
              break;

            default:
              throw path.buildCodeFrameError(
                `Unrecognized rewrite kind ${rewriteKind}`,
              );
          }
        }
        replace.push(
          ...specs.map(spec => {
            const { local, exported } = spec;
            liveExportMap[exported.name] = [local.name];
            const callee = t.memberExpression(
              hiddenIdentifier(HIDDEN_LIVE),
              exported,
            );
            return t.expressionStatement(t.callExpression(callee, []));
          }),
          // and don't evaluate to anything.
          t.expressionStatement(t.identifier('undefined')),
        );
        path.replaceWithMultiple(replace);
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

  let lastImportHandle = 0;
  const importHandleData = {};

  function createImportHandle(state) {
    const { evaluateProgram, moduleMapper: mapper, loader, url } = state;

    const evaluatorAllowHidden = (src, endowments = {}, options = {}) =>
      evaluateProgram(src, endowments, { allowHidden: true, ...options });

    lastImportHandle += 1;
    const importHandle = lastImportHandle;

    const moduleMapper = mapper || ((_base, mod) => mod);
    importHandleData[importHandle] = {
      evaluatorAllowHidden,
      url,
      moduleMapper,
      loader,
    };

    return importHandle;
  }

  function transformSource(source, options = {}) {
    // Transform the script/expression source for import expressions.
    const sourceOptions = {
      ...options,
      importHandleUsed: false,
    };

    const parserPlugins = ['dynamicImport'];
    if (options.sourceType === 'module') {
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

    if (!sourceOptions.importHandleUsed && options.sourceType !== 'module') {
      // Release this importHandle, as the source didn't use it.
      delete importHandleData[options.importHandle];
    }

    // console.log(`transformed to`, output.code);
    return output.code;
  }

  function createStaticRecord(moduleSource, state) {
    // Transform the Module source code.
    const importHandle = createImportHandle(state);
    const sourceOptions = {
      importHandle,
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
    preamble += `${HIDDEN_IMPORTS}({${Object.keys(isrc)
      .map(
        src =>
          `${js(src)}: ${Object.entries(isrc[src])
            .map(([exp, upds]) => `${js(exp)}: [${upds.join(',')}]`)
            .join(',')}`,
      )
      .join(',')}});`;
    preamble += sourceOptions.hoistedDecls
      .map(vname => `${HIDDEN_LIVE}.${vname}();`)
      .join('');

    const functorSource = `\
(function moduleFunctor(${HIDDEN_IMPORTS}, ${HIDDEN_ONCE}, ${HIDDEN_LIVE}) { \
  'use strict'; \
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

  function makeAsyncLoader(counter, loader, state) {
    const { moduleMapper } = state;
    return function loadOne(base, specifier) {
      let msr = staticModuleMap.get(specifier);
      if (msr) {
        // Loading in progress, or already a module static record.
        return Promise.resolve(msr);
      }

      // Begin the recursive load.
      counter(+1);
      const loaded = specifier.moduleSource
        ? Promise.resolve([base, specifier.moduleSource])
        : loader(specifier);
      const p = loaded
        .then(([depBase, depSource]) => {
          msr = createStaticRecord(depSource, { ...state, url: depBase });
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

  const hiddenImport = es => importHandle => {
    const {
      evaluatorAllowHidden,
      url: baseUrl,
      moduleMapper,
      moduleSource,
      moduleEndowments,
      loader,
    } = importHandleData[importHandle];
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
            baseSpecifier.moduleEndowments || {},
          );

          // TODO: Maybe initialize in makeLinkedInstance?
          li.initialize();
          resolveImport(li.moduleNS);
        }
      }

      // Count up to prevent early return.
      counter(+1);
      const loadOne = makeAsyncLoader(counter, loader, es);

      if (baseMod === true) {
        // Load moduleSource directly.
        baseSpecifier = {
          toString() {
            return '[evaluateModule]';
          },
          moduleSource,
          moduleEndowments,
        };
      } else {
        // Map the baseMod to a specifier.
        baseSpecifier = moduleMapper(baseUrl, baseMod);
      }

      // Start the loading chain.
      loadOne(baseUrl, baseSpecifier).catch(rejectImport);

      // Count down in case there was nothing to load, so we can finish.
      counter(-1);
      return importP;
    };

    importExpr.meta = Object.create(null);
    importExpr.meta.url = baseUrl;
    return importExpr;
  };

  return {
    endow(es) {
      // Add the $h_import hidden endowment.
      Object.assign(es.endowments, { [HIDDEN_IMPORT]: hiddenImport(es) });
      return es;
    },
    rewrite(ss) {
      // Transform the source into evaluable form.
      const { allowHidden, endowments, src: source } = ss;

      // Allocate a new importHandle, deallocated later if not used.
      const importHandle = createImportHandle(ss);
      if (ss.sourceType === 'module') {
        // Import our own source directly, returning a promise.
        importHandleData[importHandle].moduleSource = source;
        importHandleData[importHandle].moduleEndowments = endowments;
        return {
          ...ss,
          moduleRewritten: true,
          src: `${HIDDEN_IMPORT}(${JSON.stringify(importHandle)})(true)`,
        };
      }

      // Transform the Script or Expression source code.
      const maybeSource = transformSource(source, {
        allowHidden,
        importHandle,
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
      return { ...ss, src: actualSource };
    },
  };
};

export default makeModuleTransformer;
