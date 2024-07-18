module.exports = {
  meta: /** @type {const} */ ({
    type: 'problem',
    docs: {
      description: 'Ensure all named exports are passed to `harden` function',
      category: 'Possible Errors',
      recommended: false,
    },
    schema: [], // no options
  }),
  create: function (context) {
    let namedExports = [];
    let hardenCallNode = null;

    return {
      ExportNamedDeclaration(node) {
        if (node.declaration && node.declaration.declarations) {
          namedExports = namedExports.concat(
            node.declaration.declarations.map(decl => decl.id.name),
          );
        } else if (node.specifiers) {
          namedExports = namedExports.concat(
            node.specifiers.map(spec => spec.exported.name),
          );
        }
      },
      CallExpression(node) {
        if (node.callee.name === 'harden') {
          hardenCallNode = node;
          const args = node.arguments[0];
          if (args && args.type === 'ObjectExpression') {
            const properties = args.properties.map(prop => prop.key.name);
            const missingExports = namedExports.filter(
              exp => !properties.includes(exp),
            );
            if (missingExports.length > 0) {
              context.report({
                node,
                message: `Missing exports in harden call: ${missingExports.join(', ')}`,
              });
            }
          }
        }
      },
      'Program:exit'(node) {
        if (namedExports.length > 0 && !hardenCallNode) {
          context.report({
            node,
            message: `No call to 'harden' found in the module.`,
          });
        }
      },
    };
  },
};
