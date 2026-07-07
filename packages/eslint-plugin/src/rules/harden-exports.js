// @ts-nocheck
import { createRule } from '../create-rule.js';

/**
 * Recursively collect the names introduced by a destructuring or identifier
 * binding pattern.
 *
 * Handles all binding pattern shapes that may appear on the left-hand side of
 * any `export <kind> ... = ...` declaration where `<kind>` is `const`, `let`,
 * or `var`. Skips sparse array holes (null elements). Returns `true` when all
 * sub-patterns were recognized, `false` when an unknown pattern type was
 * encountered.
 * @param pattern
 * @param names
 */
const pushDeclaredNames = (pattern, names) => {
  if (pattern === null) {
    return true;
  }
  switch (pattern.type) {
    case 'Identifier': {
      names.push(pattern.name);
      return true;
    }
    case 'ObjectPattern': {
      let ok = true;
      for (const prop of pattern.properties) {
        if (prop.type === 'RestElement') {
          ok = pushDeclaredNames(prop.argument, names) && ok;
        } else {
          // Property: prop.value is the binding target (aliasName for { propName: aliasName }).
          ok = pushDeclaredNames(prop.value, names) && ok;
        }
      }
      return ok;
    }
    case 'ArrayPattern': {
      let ok = true;
      for (const element of pattern.elements) {
        ok = pushDeclaredNames(element, names) && ok;
      }
      return ok;
    }
    case 'AssignmentPattern': {
      return pushDeclaredNames(pattern.left, names);
    }
    case 'RestElement': {
      return pushDeclaredNames(pattern.argument, names);
    }
    case 'TSAsExpression': {
      // TypeScript `export const { name, ...rest }: Type = obj;`
      // The actual pattern is nested inside the TSAsExpression.
      return pushDeclaredNames(pattern.expression, names);
    }
    default: {
      return false;
    }
  }
};

/**
 * Returns `true` when the initializer is a call of the form `M.something(...)`.
 * Such calls return values that are already hardened by Pattern makers, so a
 * follow-up `harden(name)` would be redundant.
 * @param init
 */
const isPatternMakerCall = init => {
  if (!init || init.type !== 'CallExpression') {
    return false;
  }
  const { callee } = init;
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const { object } = callee;
  return object.type === 'Identifier' && object.name === 'M';
};

export default createRule({
  name: 'harden-exports',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure each named export is immediately followed by a call to `harden`.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingHardenCall:
        "Named export(s) '{{names}}' should be followed by a call to 'harden'.",
      functionExportNotConst:
        "Export '{{name}}' should be a const declaration with an arrow function.",
      unknownBindingPattern:
        'Unrecognized binding pattern in named export; rule cannot verify harden coverage.',
    },
  },
  defaultOptions: [],
  create(context) {
    const exportNodes = [];

    return {
      ExportNamedDeclaration(node) {
        exportNodes.push(node);
      },

      'Program:exit': function () {
        const sourceCode = context.sourceCode ?? context.getSourceCode();

        for (const exportNode of exportNodes) {
          const exportNames = [];
          let allRecognized = true;

          if (exportNode.declaration) {
            if (exportNode.declaration.type === 'VariableDeclaration') {
              for (const declaration of exportNode.declaration.declarations) {
                if (!isPatternMakerCall(declaration.init ?? null)) {
                  const id = declaration.id;
                  const recognized = pushDeclaredNames(id, exportNames);
                  if (!recognized) {
                    allRecognized = false;
                    context.report({
                      node: declaration,
                      messageId: 'unknownBindingPattern',
                    });
                  }
                }
              }
            } else if (exportNode.declaration.type === 'FunctionDeclaration') {
              context.report({
                node: exportNode,
                messageId: 'functionExportNotConst',
                data: {
                  name: exportNode.declaration.id?.name ?? '(anonymous)',
                },
              });
            }
          } else if (exportNode.specifiers) {
            for (const spec of exportNode.specifiers) {
              if (spec.exported.type === 'Identifier') {
                exportNames.push(spec.exported.name);
              }
            }
          }

          if (!allRecognized) {
            // eslint-disable-next-line no-continue
            continue;
          }

          const missingHardenCalls = [];
          for (const exportName of exportNames) {
            const hasHardenCall = sourceCode.ast.body.some(statement => {
              return (
                statement.type === 'ExpressionStatement' &&
                statement.expression.type === 'CallExpression' &&
                statement.expression.callee.name === 'harden' &&
                statement.expression.arguments.length === 1 &&
                statement.expression.arguments[0].name === exportName
              );
            });
            if (!hasHardenCall) {
              missingHardenCalls.push(exportName);
            }
          }

          if (missingHardenCalls.length > 0) {
            context.report({
              node: exportNode,
              messageId: 'missingHardenCall',
              data: { names: missingHardenCalls.join(', ') },
              fix(fixer) {
                const hardenCalls = missingHardenCalls
                  .map(name => `harden(${name});`)
                  .join('\n');
                return fixer.insertTextAfter(exportNode, `\n${hardenCalls}`);
              },
            });
          }
        }
      },
    };
  },
});
