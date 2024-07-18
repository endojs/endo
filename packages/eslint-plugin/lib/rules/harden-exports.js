module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure each named export is followed by a call to `harden` function',
      category: 'Possible Errors',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  create: function (context) {
    let exportNodes = [];

    return {
      ExportNamedDeclaration(node) {
        exportNodes.push(node);
      },
      'Program:exit'() {
        const sourceCode = context.getSourceCode();

        for (const exportNode of exportNodes) {
          let exportNames = [];
          if (exportNode.declaration) {
            if (exportNode.declaration.declarations) {
              for (const declaration of exportNode.declaration.declarations) {
                if (declaration.id.type === 'ObjectPattern') {
                  for (const prop of declaration.id.properties) {
                    exportNames.push(prop.key.name);
                  }
                } else {
                  exportNames.push(declaration.id.name);
                }
              }
            } else {
              // Handling function exports
              exportNames.push(exportNode.declaration.id.name);
            }
          } else if (exportNode.specifiers) {
            for (const spec of exportNode.specifiers) {
              exportNames.push(spec.exported.name);
            }
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
            const noun = missingHardenCalls.length === 1 ? 'export' : 'exports';
            context.report({
              node: exportNode,
              message: `The named ${noun} '${missingHardenCalls.join(', ')}' should be followed by a call to 'harden'.`,
              fix: function (fixer) {
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
};
