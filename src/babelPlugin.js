import * as h from './hidden';

export default options =>
  function rewriteModules({ types: t }) {
    const { fixedExports, imports, importDecls, liveExportMap } = options;
    const hiddenIdentifier = hi => {
      const ident = t.identifier(hi);
      ident.allowedInternalHidden = true;
      return ident;
    };
    const updaters = {};
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

    // We handle all the import and export productions.
    const moduleVisitor = {
      ImportDeclaration(path) {
        const specs = path.node.specifiers;
        const myImports = [];
        imports[path.node.source.value] = myImports;
        if (!specs) {
          return;
        }
        specs.forEach(spec => {
          const importTo = spec.local.name;
          importDecls.push(importTo);
          let importFrom;
          switch (spec.type) {
            case 'ImportDefaultSpecifier':
              importFrom = 'default';
              break;
            case 'ImportNamespaceSpecifier':
              importFrom = '*';
              break;
            case 'ImportSpecifier':
              importFrom = spec.imported.name;
              break;
            default:
              throw path.buildCodeFrameError(
                `Unrecognized import specifier type ${spec.type}`,
              );
          }

          const myUpdaters = myImports[importFrom] || [];
          if (myUpdaters.length === 0) {
            myImports[importFrom] = myUpdaters;
          }
          myUpdaters.push(`${h.HIDDEN_A} => (${importTo} = ${h.HIDDEN_A})`);
          updaters[importTo] = myUpdaters;
        });
      },
      ExportDefaultDeclaration(path) {
        // export default FOO -> $h_once.default(FOO)
        fixedExports.push('default');
        const callee = t.memberExpression(
          hiddenIdentifier(h.HIDDEN_ONCE),
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
            switch (pattern.type) {
              case 'Identifier':
                return [pattern];
              case 'RestElement':
                return collectPatternIdentifiers(pattern.argument);
              case 'ObjectProperty':
                return collectPatternIdentifiers(pattern.value);
              case 'ObjectPattern':
                return pattern.properties.reduce((prior, prop) => {
                  prior.push(...collectPatternIdentifiers(prop));
                  return prior;
                }, []);
              case 'ArrayPattern':
                return pattern.elements.reduce((prior, pat) => {
                  if (pat !== null) {
                    // Non-elided pattern.
                    prior.push(...collectPatternIdentifiers(pat));
                  }
                  return prior;
                }, []);
              default:
                throw path.buildCodeFrameError(
                  `Pattern type ${pattern.type} is not recognized`,
                );
            }
          };

          // Find all the declared identifiers.
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
        }
        replace.push(
          ...specs.map(spec => {
            const { local, exported, source } = spec;
            // If local.name is reexported we omit it.
            const myUpdaters = updaters[local.name];
            if (myUpdaters) {
              // If there are updaters, we must have a local
              // name, so update it with this export.
              myUpdaters.push(`${h.HIDDEN_LIVE}.${local.name}`);
            }
            // If it was imported directly (i.e. has a source or updaters)
            // then don't put the local name in the liveExportMap.
            liveExportMap[exported.name] =
              source || myUpdaters ? [] : [local.name];
            const callee = t.memberExpression(
              hiddenIdentifier(h.HIDDEN_LIVE),
              exported,
            );
            return t.expressionStatement(t.callExpression(callee, []));
          }),
          // and don't evaluate to anything.
          t.expressionStatement(t.identifier('undefined')),
        );
        path.replaceWithMultiple(replace);
      },
    };

    if (options.sourceType === 'module') {
      // Add the module visitor.
      Object.assign(visitor, moduleVisitor);
    }
    return { visitor };
  };
