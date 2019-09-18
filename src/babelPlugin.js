import * as h from './hidden';

// export const pattern = ...;
const collectPatternIdentifiers = (path, pattern) => {
  switch (pattern.type) {
    case 'Identifier':
      return [pattern];
    case 'RestElement':
      return collectPatternIdentifiers(path, pattern.argument);
    case 'ObjectProperty':
      return collectPatternIdentifiers(path, pattern.value);
    case 'ObjectPattern':
      return pattern.properties.reduce((prior, prop) => {
        prior.push(...collectPatternIdentifiers(path, prop));
        return prior;
      }, []);
    case 'ArrayPattern':
      return pattern.elements.reduce((prior, pat) => {
        if (pat !== null) {
          // Non-elided pattern.
          prior.push(...collectPatternIdentifiers(path, pat));
        }
        return prior;
      }, []);
    default:
      throw path.buildCodeFrameError(
        `Pattern type ${pattern.type} is not recognized`,
      );
  }
};

export default options =>
  function rewriteModules({ types: t }) {
    const {
      fixedExportMap,
      imports,
      importDecls,
      importSources,
      liveExportMap,
    } = options;
    const hiddenIdentifier = hi => {
      const ident = t.identifier(hi);
      ident.allowedInternalHidden = true;
      return ident;
    };
    const updaterSources = {};
    const topLevelDecls = {};

    const rewriteExportDecl = (path, decl) => {
      // Find all the declared identifiers.
      const replace = [];
      const vids = (decl.declarations || [decl]).reduce(
        (prior, { id: pat }) => {
          prior.push(...collectPatternIdentifiers(path, pat));
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
        vnames.forEach(vname => (fixedExportMap[vname] = [vname]));
      }

      // Create the export calls.
      const exportFname = hiddenIdentifier(
        isLive ? h.HIDDEN_LIVE : h.HIDDEN_ONCE,
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
      } else if (decl.type !== 'VariableDeclaration') {
        throw path.buildCodeFrameError(
          `Unrecognized declaration type ${decl.type}`,
        );
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
      return replace;
    };

    const visitor = {
      Identifier(path) {
        if (options.allowHidden || path.node.allowedInternalHidden) {
          return;
        }
        // Ensure the parse doesn't already include our required hidden symbols.
        // console.log(`have identifier`, path.node);
        const i = h.HIDDEN_SYMBOLS.indexOf(path.node.name);
        if (i >= 0) {
          throw path.buildCodeFrameError(
            `The ${h.HIDDEN_SYMBOLS[i]} identifier is reserved`,
          );
        }
      },
      CallExpression(path) {
        // import(FOO) -> $h_import(FOO)
        if (path.node.callee.type === 'Import') {
          path.node.callee = hiddenIdentifier(h.HIDDEN_IMPORT);
        }
      },
    };

    const moduleVisitor = {
      Program: {
        exit(_path) {
          const rewriteMap = new Map();
          [
            [fixedExportMap, hiddenIdentifier(h.HIDDEN_ONCE)],
            [liveExportMap, hiddenIdentifier(h.HIDDEN_LIVE)],
          ].forEach(([exportMap, exportId]) => {
            Object.entries(exportMap).forEach(([_exportName, [localName]]) => {
              // Find all the traversal paths for the local names.
              // console.error(`adding`, _exportName, localName, topLevelDecls);
              if (!localName) {
                return;
              }
              const path = topLevelDecls[localName];
              if (!path) {
                return;
              }
              let rewrites = rewriteMap.get(path);
              if (!rewrites) {
                // Ensure the local name will be rewritten.
                rewrites = new Map();
                rewriteMap.set(path, rewrites);
              }
              rewrites.set(localName, exportId);
            });
          });
          rewriteMap.forEach((rewrites, path) => {
            // console.log(`rewriteMap`, rewrites, path);
            const body = [path.node];
            // Rewrite the traversal paths for the export identifier.
            rewrites.forEach((exportId, vname) => {
              // console.error(`replacing`, vname, exportId);
              const callee = t.memberExpression(exportId, t.identifier(vname));
              body.push(
                t.expressionStatement(
                  t.callExpression(callee, [t.identifier(vname)]),
                ),
              );
            });
            if (path.node.kind === 'const') {
              path.replaceWithMultiple(body);
            } else {
              path.replaceWith(t.blockStatement(body));
            }
          });
        },
      },

      // We handle all the import and export productions.
      ImportDeclaration(path) {
        const specs = path.node.specifiers;
        const specifier = path.node.source.value;
        let myImportSources = importSources[specifier];
        if (!myImportSources) {
          myImportSources = [];
          importSources[specifier] = myImportSources;
        }
        let myImports = imports[specifier];
        if (!myImports) {
          myImports = [];
          imports[specifier] = myImports;
        }
        if (!specs) {
          return;
        }
        specs.forEach(spec => {
          const importTo = spec.local.name;
          importDecls.push(importTo);
          let importFrom;
          switch (spec.type) {
            // import importTo from 'module';
            case 'ImportDefaultSpecifier':
              importFrom = 'default';
              break;
            // import * as importTo from 'module';
            case 'ImportNamespaceSpecifier':
              importFrom = '*';
              break;
            // import { importFrom as importTo } from 'module';
            case 'ImportSpecifier':
              importFrom = spec.imported.name;
              break;
            default:
              throw path.buildCodeFrameError(
                `Unrecognized import specifier type ${spec.type}`,
              );
          }
          if (myImports.indexOf(importFrom) < 0) {
            myImports.push(importFrom);
          }

          let myUpdaterSources = myImportSources[importFrom];
          if (!myUpdaterSources) {
            myUpdaterSources = [];
            myImportSources[importFrom] = myUpdaterSources;
          }

          myUpdaterSources.push(
            `${h.HIDDEN_A} => (${importTo} = ${h.HIDDEN_A})`,
          );
          updaterSources[importTo] = myUpdaterSources;
        });
        // Nullify the import declaration.
        path.replaceWithMultiple([]);
      },
      ExportDefaultDeclaration(path) {
        // export default FOO -> $h_once.default(FOO)
        fixedExportMap.default = ['default'];
        const callee = t.memberExpression(
          hiddenIdentifier(h.HIDDEN_ONCE),
          t.identifier('default'),
        );
        path.replaceWith(t.callExpression(callee, [path.node.declaration]));
      },
      VariableDeclaration(path) {
        if (
          path.parent.type !== 'Program' ||
          path.node.ignoreForModuleTransform
        ) {
          return;
        }

        // We may need to rewrite this topLevelDecl later.
        const vids = path.node.declarations.reduce((prior, { id: pat }) => {
          prior.push(...collectPatternIdentifiers(path, pat));
          return prior;
        }, []);
        vids.forEach(vid => {
          topLevelDecls[vid.name] = path;
        });
      },
      ExportNamedDeclaration(path) {
        const { declaration: decl, specifiers: specs, source } = path.node;
        const replace = [];
        if (decl) {
          decl.ignoreForModuleTransform = true;
          replace.push(...rewriteExportDecl(path, decl));
        }
        specs.forEach(spec => {
          const { local, exported } = spec;
          // If local.name is reexported we omit it.
          const myUpdaterSources = updaterSources[local.name];
          if (myUpdaterSources) {
            // If there are updaters, we must have a local
            // name, so update it with this export.
            myUpdaterSources.push(`${h.HIDDEN_LIVE}.${local.name}`);
          }

          // If it was imported directly (i.e. has a source or updaters)
          // then don't put the local name in the liveExportMap.
          liveExportMap[exported.name] = source ? [] : [local.name];
          // source || myUpdaterSources ? [] : [local.name];
        });

        path.replaceWithMultiple(replace);
      },
    };

    if (options.sourceType === 'module') {
      // Add the module visitor.
      Object.assign(visitor, moduleVisitor);
    }
    return { visitor };
  };
