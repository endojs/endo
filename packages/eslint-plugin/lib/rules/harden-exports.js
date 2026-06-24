/* eslint-disable func-names */
/**
 * @module Ensure each named export is followed by a call to `harden` function
 */

'use strict';

/**
 * @import {Rule} from 'eslint';
 * @import * as ESTree from 'estree';
 */

/**
 * Recursively collect the names introduced by a destructuring or identifier
 * binding pattern.
 *
 * Handles all binding pattern shapes that may appear on the left-hand side of
 * any `export <kind> ... = ...` declaration where `<kind>` is `const`, `let`,
 * or `var` (the rule visits every `ExportNamedDeclaration` carrying a
 * `VariableDeclaration`, not just `const`):
 *
 * - Identifier: `export const a = ...`.
 * - ObjectPattern properties: `export const { a } = ...` and
 *   `export const { propName: aliasName } = ...`. We recurse into prop.value
 *   (the binding target) rather than prop.key (the source property name);
 *   in shorthand they are the same node, but with an alias they differ.
 * - ObjectPattern rest: `export const { ...rest } = ...`.
 * - ArrayPattern elements: `export const [ a, b ] = ...`. Skips null elements
 *   that represent sparse holes (`[ , a ]`).
 * - AssignmentPattern: defaults like `export const [ a = 1 ] = ...` or
 *   `export const { a: b = 1 } = ...`. The bound name lives in node.left.
 * - RestElement: `export const [ a, ...rest ] = ...` and object rest above.
 *
 * Returns true if every encountered sub-pattern was a recognized shape, false
 * if any unknown pattern type was traversed (so the caller may decide whether
 * to surface a report rather than silently produce a possibly incomplete name
 * list).
 * @param {ESTree.Pattern | null} pattern
 * @param {string[]} names
 * @returns {boolean}
 */
const pushDeclaredNames = (pattern, names) => {
  if (pattern === null) {
    // Sparse array hole, e.g., `const [ , a ] = ...`.
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
        } else if (prop.type === 'Property') {
          // For `{ propName: aliasName }`, prop.value is the binding target
          // (`aliasName`); for shorthand `{ name }`, prop.value === prop.key.
          // ESTree narrows ObjectPattern's properties to Property|RestElement,
          // so prop.value is always a Pattern here.
          ok = pushDeclaredNames(prop.value, names) && ok;
        } else {
          ok = false;
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
      // The default value lives in node.right; the binding is in node.left.
      return pushDeclaredNames(pattern.left, names);
    }
    case 'RestElement': {
      return pushDeclaredNames(pattern.argument, names);
    }
    default: {
      // Unknown pattern shape; the caller is responsible for surfacing this.
      // Returning false keeps the helper resilient to future ECMAScript
      // binding patterns while making the gap visible.
      return false;
    }
  }
};

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
    messages: {
      missingHardenCall:
        "Named export(s) '{{names}}' should be followed by a call to 'harden'.",
      functionExportNotConst:
        "Export '{{name}}' should be a const declaration with an arrow function.",
      unknownBindingPattern:
        'Unrecognized binding pattern in named export; rule cannot verify harden coverage.',
    },
  },
  /**
   * Create function for the rule.
   * @param {Rule.RuleContext} context - The rule context.
   * @returns {object} The visitor object.
   */
  create(context) {
    /** @type {Array<ESTree.ExportNamedDeclaration & Rule.NodeParentExtension>} */
    const exportNodes = [];

    /**
     * Returns true when the initializer is a call expression of the form
     * `M.something(...)`. Such calls return values that are already hardened
     * by Pattern makers, so a follow-up `harden(name)` would be redundant.
     * @param {ESTree.Node | null | undefined} init
     * @returns {boolean}
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

    return {
      /** @param {ESTree.ExportNamedDeclaration & Rule.NodeParentExtension} node */
      ExportNamedDeclaration(node) {
        exportNodes.push(node);
      },
      'Program:exit': function () {
        const sourceCode = context.getSourceCode();

        for (const exportNode of exportNodes) {
          /** @type {string[]} */
          const exportNames = [];
          // Stays true only if every binding pattern encountered for this
          // export was a shape `pushDeclaredNames` recognized.
          let allRecognized = true;
          if (exportNode.declaration) {
            if (exportNode.declaration.type === 'VariableDeclaration') {
              for (const declaration of exportNode.declaration.declarations) {
                // Skip Pattern maker initializers like `M.string()` or
                // `M.arrayOf(...)`; their results are already hardened, so
                // a follow-up `harden(name)` is redundant.
                if (!isPatternMakerCall(declaration.init)) {
                  const recognized = pushDeclaredNames(
                    declaration.id,
                    exportNames,
                  );
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
                // The 'function' keyword hoisting makes the value mutable
                // before it can be hardened.
                messageId: 'functionExportNotConst',
                data: { name: exportNode.declaration.id.name },
              });
            }
          } else if (exportNode.specifiers) {
            for (const spec of exportNode.specifiers) {
              exportNames.push(
                /** @type {ESTree.Identifier} */ (spec.exported).name,
              );
            }
          }

          // Skip the missing-harden enforcement for this export entirely
          // when any binding pattern was unrecognized. The
          // `unknownBindingPattern` report above already names the
          // declaration as unverifiable; emitting a missing-harden report
          // and autofix on top of a possibly incomplete name list would
          // contradict that admission and risk inserting wrong fixes.
          if (allRecognized) {
            const missingHardenCalls = [];
            for (const exportName of exportNames) {
              const hasHardenCall = sourceCode.ast.body.some(statement => {
                return (
                  statement.type === 'ExpressionStatement' &&
                  statement.expression.type === 'CallExpression' &&
                  // @ts-expect-error xxx typedef
                  statement.expression.callee.name === 'harden' &&
                  statement.expression.arguments.length === 1 &&
                  // @ts-expect-error xxx typedef
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
        }
      },
    };
  },
};
