/* eslint max-lines: 0 */

import * as h from './hidden.js';

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

function makeModulePlugins(options) {
  const {
    exportAlls,
    fixedExportMap,
    imports,
    importDecls,
    importSources,
    liveExportMap,
  } = options;
  const updaterSources = Object.create(null);
  const topLevelIsOnce = Object.create(null);
  const topLevelExported = Object.create(null);

  const rewriteModules = pass => ({ types: t }) => {
    const allowedHiddens = new WeakSet();
    const rewrittenDecls = new WeakSet();
    const hiddenIdentifier = hi => {
      const ident = t.identifier(hi);
      allowedHiddens.add(ident);
      return ident;
    };
    const hOnceId = hiddenIdentifier(h.HIDDEN_ONCE);
    const hLiveId = hiddenIdentifier(h.HIDDEN_LIVE);
    const soften = id => {
      // Remap the name to $c_name.
      const { name } = id;
      id.name = `${h.HIDDEN_CONST_VAR_PREFIX}${name}`;
      allowedHiddens.add(id);
    };

    const rewriteVars = (vids, isConst, needsHoisting) =>
      vids.reduce((prior, id) => {
        const { name } = id;
        if (!isConst && !topLevelIsOnce[name]) {
          if (topLevelExported[name]) {
            // Just add $h_live.name($c_name);
            soften(id);
            prior.push(
              t.expressionStatement(
                t.callExpression(
                  t.memberExpression(hLiveId, t.identifier(name)),
                  [id],
                ),
              ),
            );
            for (const importTo of topLevelExported[name]) {
              liveExportMap[importTo] = [name, true];
            }
          } else {
            // Make this variable mutable with: let name = $c_name;
            soften(id);
            prior.push(
              t.variableDeclaration('let', [
                t.variableDeclarator(t.identifier(name), id),
              ]),
            );
          }
        } else if (topLevelExported[name]) {
          if (needsHoisting) {
            // Hoist the declaration and soften.
            soften(id);
            if (needsHoisting === 'function') {
              options.hoistedDecls.push([name, id.name]);
            } else {
              // Rewrite to be just name = value.
              options.hoistedDecls.push([name]);
              prior.push(
                t.expressionStatement(
                  t.assignmentExpression('=', t.identifier(name), id),
                ),
              );
            }
            for (const importTo of topLevelExported[name]) {
              liveExportMap[importTo] = [name, true];
            }
          } else {
            // Just add $h_once.name(name);
            prior.push(
              t.expressionStatement(
                t.callExpression(t.memberExpression(hOnceId, id), [id]),
              ),
            );
            for (const importTo of topLevelExported[name]) {
              fixedExportMap[importTo] = [name];
            }
          }
        }
        return prior;
      }, []);

    const rewriteDeclaration = path => {
      // Find all the declared identifiers.
      if (rewrittenDecls.has(path.node)) {
        return;
      }
      const decl = path.node;
      const declarations = decl.declarations || [decl];
      const vids = declarations.reduce((prior, { id: pat }) => {
        prior.push(...collectPatternIdentifiers(path, pat));
        return prior;
      }, []);

      // Create the export calls.
      const isConst = decl.kind === 'const';
      const replace = rewriteVars(
        vids,
        isConst,
        decl.type === 'FunctionDeclaration'
          ? 'function'
          : !isConst && decl.kind !== 'let',
      );

      if (replace.length > 0) {
        switch (decl.type) {
          case 'VariableDeclaration': {
            // We rewrote the declaration.
            rewrittenDecls.add(decl);
            replace.unshift(decl);
            break;
          }
          case 'FunctionDeclaration': {
            replace.unshift(decl);
            break;
          }
          default: {
            throw TypeError(`Unknown declaration type ${decl.type}`);
          }
        }
      }
      if (replace.length > 0) {
        path.replaceWithMultiple(replace);
      }
    };

    const visitor = {
      Identifier(path) {
        if (options.allowHidden || allowedHiddens.has(path.node)) {
          return;
        }
        // Ensure the parse doesn't already include our required hidden identifiers.
        // console.log(`have identifier`, path.node);
        const i = h.HIDDEN_IDENTIFIERS.indexOf(path.node.name);
        if (i >= 0) {
          throw path.buildCodeFrameError(
            `The ${h.HIDDEN_IDENTIFIERS[i]} identifier is reserved`,
          );
        }
        if (path.node.name.startsWith(h.HIDDEN_CONST_VAR_PREFIX)) {
          throw path.buildCodeFrameError(
            `The ${path.node.name} constant variable is reserved`,
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

    const moduleVisitor = (doAnalyze, doTransform) => ({
      // We handle all the import and export productions.
      ImportDeclaration(path) {
        if (doAnalyze) {
          const specs = path.node.specifiers;
          const specifier = path.node.source.value;
          let myImportSources = importSources[specifier];
          if (!myImportSources) {
            myImportSources = Object.create(null);
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
            if (myImports && myImports.indexOf(importFrom) < 0) {
              myImports.push(importFrom);
            }

            if (myImportSources) {
              let myUpdaterSources = myImportSources[importFrom];
              if (!myUpdaterSources) {
                myUpdaterSources = [];
                myImportSources[importFrom] = myUpdaterSources;
              }

              myUpdaterSources.push(
                `${h.HIDDEN_A} => (${importTo} = ${h.HIDDEN_A})`,
              );
              updaterSources[importTo] = myUpdaterSources;
            }
          });
        }
        if (doTransform) {
          // Nullify the import declaration.
          path.replaceWithMultiple([]);
        }
      },
      ExportDefaultDeclaration(path) {
        // export default FOO -> $h_once.default(FOO)
        if (doAnalyze) {
          fixedExportMap.default = ['default'];
        }
        if (doTransform) {
          const id = t.identifier('default');
          const cid = t.identifier('default');
          soften(cid);
          const callee = t.memberExpression(
            hiddenIdentifier(h.HIDDEN_ONCE),
            id,
          );
          let expr = path.node.declaration;
          if (expr.type === 'ClassDeclaration') {
            expr = t.classExpression(expr.id, expr.superClass, expr.body);
          } else if (expr.type === 'FunctionDeclaration') {
            expr = t.functionExpression(
              expr.id,
              expr.params,
              expr.body,
              expr.generator,
              expr.async,
            );
          }
          // const {default: $c_default} = {default: (XXX)}; $h_once.default($c_default);
          path.replaceWithMultiple([
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.objectPattern([t.objectProperty(id, cid)]),
                t.objectExpression([t.objectProperty(id, expr)]),
              ),
            ]),
            t.expressionStatement(t.callExpression(callee, [cid])),
          ]);
        }
      },
      ClassDeclaration(path) {
        const ptype = path.parent.type;
        if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
          return;
        }

        const { name } = path.node.id;
        if (doAnalyze) {
          topLevelIsOnce[name] = path.scope.getBinding(name).constant;
        }
        if (doTransform) {
          if (topLevelExported[name]) {
            const callee = t.memberExpression(
              hiddenIdentifier(h.HIDDEN_LIVE),
              path.node.id,
            );
            path.replaceWith(
              t.blockStatement([
                path.node,
                t.expressionStatement(t.callExpression(callee, [path.node.id])),
              ]),
            );
            for (const importTo of topLevelExported[name]) {
              liveExportMap[importTo] = [name, true];
            }
          }
        }
      },
      FunctionDeclaration(path) {
        const ptype = path.parent.type;
        if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
          return;
        }

        const { name } = path.node.id;
        if (doAnalyze) {
          topLevelIsOnce[name] = path.scope.getBinding(name).constant;
        }
        if (doTransform) {
          if (topLevelExported[name]) {
            rewriteDeclaration(path);
            for (const importTo of topLevelExported[name]) {
              liveExportMap[importTo] = [name, true];
            }
          }
        }
      },
      VariableDeclaration(path) {
        const ptype = path.parent.type;
        if (ptype !== 'Program' && ptype !== 'ExportNamedDeclaration') {
          return;
        }

        // We may need to rewrite this topLevelDecl later.
        const vids = path.node.declarations.reduce((prior, { id: pat }) => {
          prior.push(...collectPatternIdentifiers(path, pat));
          return prior;
        }, []);
        if (doAnalyze) {
          vids.forEach(({ name }) => {
            topLevelIsOnce[name] = path.scope.getBinding(name).constant;
          });
        }
        if (doTransform) {
          for (const { name } of vids) {
            if (topLevelExported[name]) {
              rewriteDeclaration(path);
              break;
            }
          }
        }
      },
      ExportAllDeclaration(path) {
        const { source } = path.node;
        if (doAnalyze) {
          const specifier = source.value;
          let myImportSources = importSources[specifier];
          if (!myImportSources) {
            myImportSources = Object.create(null);
            importSources[specifier] = myImportSources;
          }
          let myImports = imports[specifier];
          if (!myImports) {
            // Ensure that the specifier is imported.
            myImports = [];
            imports[specifier] = myImports;
          }
          exportAlls.push(specifier);
        }
        if (doTransform) {
          path.replaceWithMultiple([]);
        }
      },
      ExportNamedDeclaration(path) {
        const { declaration: decl, specifiers: specs, source } = path.node;

        if (doAnalyze) {
          let myImportSources;
          let myImports;
          if (source) {
            const specifier = source.value;
            myImportSources = importSources[specifier];
            if (!myImportSources) {
              myImportSources = Object.create(null);
              importSources[specifier] = myImportSources;
            }
            myImports = imports[specifier];
            if (!myImports) {
              myImports = [];
              imports[specifier] = myImports;
            }
          }

          if (decl) {
            const declarations = decl.declarations || [decl];
            const vids = declarations.reduce((prior, { id: pat }) => {
              prior.push(...collectPatternIdentifiers(path, pat));
              return prior;
            }, []);
            vids.forEach(({ name }) => {
              let tle = topLevelExported[name];
              if (!tle) {
                tle = [];
                topLevelExported[name] = tle;
              }
              tle.push(name);
            });
          }

          specs.forEach(spec => {
            const { local, exported } = spec;
            const importFrom =
              spec.type === 'ExportNamespaceSpecifier' ? '*' : local.name;

            // If local.name is reexported we omit it.
            const importTo = exported.name;
            let myUpdaterSources = updaterSources[importFrom];
            if (myImportSources) {
              myUpdaterSources = myImportSources[importFrom];
              if (!myUpdaterSources) {
                myUpdaterSources = [];
                myImportSources[importFrom] = myUpdaterSources;
              }
              updaterSources[importTo] = myUpdaterSources;
              myImports.push(importFrom);
            }

            if (myUpdaterSources) {
              // If there are updaters, we must have a local
              // name, so update it with this export.
              const ident = topLevelIsOnce[importFrom]
                ? h.HIDDEN_ONCE
                : h.HIDDEN_LIVE;
              myUpdaterSources.push(`${ident}[${JSON.stringify(importFrom)}]`);
            }

            if (source || myUpdaterSources) {
              // Not declared, so make it a live export without proxy.
              liveExportMap[importTo] = [importFrom, false];
            } else {
              let tle = topLevelExported[importFrom];
              if (!tle) {
                tle = [];
                topLevelExported[importFrom] = tle;
              }
              tle.push(importTo);
            }
          });
        }
        if (doTransform) {
          path.replaceWithMultiple(decl ? [decl] : []);
        }
      },
    });

    if (options.sourceType === 'module') {
      // Add the module visitor.
      switch (pass) {
        case 0:
          return {
            visitor: {
              ...visitor,
              ...moduleVisitor(true, false),
            },
          };
        case 1:
          return { visitor: moduleVisitor(false, true) };
        default:
          throw TypeError(`Unrecognized module pass ${pass}`);
      }
    }
    return { visitor };
  };

  const rewriters = [rewriteModules(0)];
  if (options.sourceType === 'module') {
    rewriters.push(rewriteModules(1));
  }
  return rewriters;
}

export default makeModulePlugins;
