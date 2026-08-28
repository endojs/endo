/**
 * @import {Rule} from 'eslint';
 * @import * as ESTree from 'estree';
 */

/**
 * ESLint rule module for ensuring each named export is followed by a call to `harden` function.
 * @type {Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow imports of exports with AmbientAuth',
      category: 'Possible Errors',
      recommended: true,
    },
    schema: [
      {
        type: 'object',
        properties: {
          ambientAuthModules: {
            type: 'array',
            items: { type: 'string' },
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      ambientAuthImport: 'Importing an export with AmbientAuth is not allowed.',
    },
  },
  /**
   * Create function for the rule.
   * @param {Rule.RuleContext} context - The rule context.
   * @returns {Object} The visitor object.
   */
  create(context) {
    const options = context.options[0] || {};
    const ambientAuthModules = options.ambientAuthModules || [
      'moduleA',
      'moduleB',
      'moduleC',
    ];

    return {
      ImportDeclaration(node) {
        const sourceValue = node.source.value;

        if (
          typeof sourceValue === 'string' &&
          ambientAuthModules.includes(sourceValue)
        ) {
          context.report({
            node,
            messageId: 'ambientAuthImport',
          });
        }
      },
      'ImportDeclaration > ImportSpecifier'(node) {
        const importDeclaration = node.parent;
        const sourceValue = importDeclaration.source.value;

        if (typeof sourceValue === 'string') {
          const variables = context.getDeclaredVariables(node);
          if (variables.length > 0) {
            const symbol = variables[0];
            const references = symbol.references;

            for (const ref of references) {
              if (isExportedSymbol(ref.identifier)) {
                context.report({
                  node: ref.identifier,
                  messageId: 'ambientAuthImport',
                });
              }
            }
          }
        }
      },
    };

    function isExportedSymbol(node) {
      let current = node.parent;
      while (current) {
        if (
          current.type === 'ExportNamedDeclaration' ||
          current.type === 'ExportDefaultDeclaration'
        ) {
          return true;
        }
        current = current.parent;
      }
      return false;
    }
  },
};
