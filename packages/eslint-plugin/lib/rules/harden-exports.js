/**
 * @fileoverview Ensure each named export is followed by a call to `harden` function
 */

'use strict';

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
      description:
        'Ensure each named export is followed by a call to `harden` function',
      category: 'Possible Errors',
      recommended: false,
    },
    fixable: 'code',
    schema: [],
  },
  /**
   * Create function for the rule.
   * @param {Rule.RuleContext} context - The rule context.
   * @returns {Object} The visitor object.
   */
  create(context) {
    /** @type {Array<ESTree.ExportNamedDeclaration & Rule.NodeParentExtension>} */
    let exportNodes = [];

    return {
      /** @param {ESTree.ExportNamedDeclaration & Rule.NodeParentExtension} node */
      ExportNamedDeclaration(node) {
        exportNodes.push(node);
      },
      'Program:exit'() {
        const sourceCode = context.getSourceCode();

        for (const exportNode of exportNodes) {
          /** @type {string[]} */
          let exportNames = [];
          if (exportNode.declaration) {
            if (exportNode.declaration.type === 'VariableDeclaration') {
              for (const declaration of exportNode.declaration.declarations) {
                if (declaration.id.type === 'ObjectPattern') {
                  for (const prop of declaration.id.properties) {
                    if (prop.type === 'RestElement') {
                      console.warn('Rest elements are not supported');
                      continue;
                    }
                    if (prop.value.type === 'Identifier') {
                      exportNames.push(prop.value.name);
                    } else if (
                      prop.value.type === 'AssignmentPattern' &&
                      prop.value.left.type === 'Identifier'
                    ) {
                      exportNames.push(prop.value.left.name);
                    }
                  }
                } else if (declaration.id.type === 'ArrayPattern') {
                  for (const element of declaration.id.elements) {
                    if (element && element.type === 'Identifier') {
                      exportNames.push(element.name);
                    }
                  }
                } else if (declaration.id.type === 'Identifier') {
                  exportNames.push(declaration.id.name);
                }
              }
            } else if (exportNode.declaration.type === 'FunctionDeclaration') {
              const nodeName = exportNode.declaration.id?.name ?? '<missing>';
              context.report({
                node: exportNode,
                // The 'function' keyword hoisting makes the valuable mutable before it can be hardened.
                message: `Export '${nodeName}' should be a const declaration with an arrow function.`,
              });
            }
          } else if (exportNode.specifiers) {
            for (const spec of exportNode.specifiers) {
              exportNames.push(spec.exported.name);
            }
          }

          const missingHardenCalls = [];
          for (const exportName of exportNames) {
            const hasHardenCall = sourceCode.ast.body.some(
              statement =>
                statement.type === 'ExpressionStatement' &&
                statement.expression.type === 'CallExpression' &&
                statement.expression.callee.type === 'Identifier' &&
                statement.expression.callee.name === 'harden' &&
                statement.expression.arguments.length === 1 &&
                ((statement.expression.arguments[0].type === 'Identifier' &&
                  statement.expression.arguments[0].name === exportName) ||
                  // @ts-expect-error XXX non-overlapping
                  (statement.expression.arguments[0].type === 'ObjectPattern' &&
                    // @ts-expect-error XXX non-overlapping
                    statement.expression.arguments[0].properties.some(
                      prop =>
                        prop.value.type === 'Identifier' &&
                        prop.value.name === exportName,
                    )) ||
                  // @ts-expect-error XXX non-overlapping
                  (statement.expression.arguments[0].type === 'ArrayPattern' &&
                    // @ts-expect-error XXX non-overlapping
                    statement.expression.arguments[0].elements.some(
                      element =>
                        element &&
                        element.type === 'Identifier' &&
                        element.name === exportName,
                    ))),
            );

            if (!hasHardenCall) {
              missingHardenCalls.push(exportName);
            }
          }

          if (missingHardenCalls.length > 0) {
            const noun = missingHardenCalls.length === 1 ? 'export' : 'exports';
            context.report({
              node: exportNode,
              message: `Named ${noun} '${missingHardenCalls.join(', ')}' should be followed by a call to 'harden'.`,
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
