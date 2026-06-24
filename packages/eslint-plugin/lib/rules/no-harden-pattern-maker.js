/* eslint-disable func-names */
/**
 * @module Disallow `harden(x)` when `x` is the result of a Pattern maker
 * (`M.something(...)`) because Pattern makers already return hardened values.
 */

'use strict';

/**
 * @import {Rule} from 'eslint';
 * @import * as ESTree from 'estree';
 */

/**
 * Returns true when the node is a `CallExpression` of the form
 * `M.something(...)`. This is the conservative shape used by the existing
 * `harden-exports` rule to detect Pattern makers; we keep the heuristic
 * identical so the two rules stay in sync.
 * @param {ESTree.Node | null | undefined} node
 * @returns {boolean}
 */
const isPatternMakerCall = node => {
  if (!node || node.type !== 'CallExpression') {
    return false;
  }
  const { callee } = node;
  if (callee.type !== 'MemberExpression') {
    return false;
  }
  const { object } = callee;
  return object.type === 'Identifier' && object.name === 'M';
};

/**
 * ESLint rule module that flags `harden(x)` when `x` is, or was bound to,
 * the result of a Pattern maker (`M.*(...)`).
 *
 * The rule has two shapes:
 *   1. `harden(M.string())` — direct call.
 *   2. `const x = M.string(); harden(x);` — identifier whose binding's
 *      initializer is a pattern maker call.
 *
 * Only the bare identifier `M` is recognized as a Pattern maker namespace,
 * matching the conservative heuristic used by `harden-exports`.
 *
 * @type {Rule.RuleModule}
 */
module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow harden() on values returned by Pattern makers (M.*) which are already hardened.',
      category: 'Best Practices',
      recommended: false,
      url: 'https://github.com/endojs/endo/blob/master/packages/eslint-plugin/lib/rules/no-harden-pattern-maker.js',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryHardenOfPatternMaker:
        'harden() is unnecessary for values returned by Pattern makers (M.*) which are already hardened.',
    },
  },
  /**
   * @param {Rule.RuleContext} context
   * @returns {Rule.RuleListener}
   */
  create(context) {
    const sourceCode = context.sourceCode || context.getSourceCode();

    /**
     * Returns true when `name` resolves in the surrounding scope to a
     * `const`/`let`/`var` binding whose single initializer is a
     * Pattern maker call.
     * @param {ESTree.Identifier} idNode - the identifier passed to harden().
     * @param {Rule.Node} contextNode - the enclosing node used for scope lookup.
     * @returns {boolean}
     */
    const identifierBoundToPatternMaker = (idNode, contextNode) => {
      const scope =
        (sourceCode.getScope && sourceCode.getScope(contextNode)) ||
        // Fallback for older ESLint
        // eslint-disable-next-line no-restricted-syntax
        context.getScope();
      // Walk outward through scopes looking for the binding.
      /** @type {import('eslint').Scope.Scope | null} */
      let current = scope;
      while (current) {
        const variable = current.variables.find(v => v.name === idNode.name);
        if (variable) {
          // Look at every definition; if any of them is a Pattern maker
          // initializer, count the binding as already hardened.
          for (const def of variable.defs) {
            if (
              def.type === 'Variable' &&
              def.node &&
              def.node.type === 'VariableDeclarator' &&
              isPatternMakerCall(def.node.init)
            ) {
              return true;
            }
          }
          return false;
        }
        current = current.upper;
      }
      return false;
    };

    return {
      /** @param {ESTree.CallExpression & Rule.NodeParentExtension} node */
      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          node.callee.name !== 'harden'
        ) {
          return;
        }
        if (node.arguments.length !== 1) {
          return;
        }
        const arg = node.arguments[0];

        let matched = false;
        if (isPatternMakerCall(arg)) {
          matched = true;
        } else if (
          arg.type === 'Identifier' &&
          identifierBoundToPatternMaker(arg, /** @type {Rule.Node} */ (node))
        ) {
          matched = true;
        }

        if (!matched) {
          return;
        }

        context.report({
          node,
          messageId: 'unnecessaryHardenOfPatternMaker',
          fix(fixer) {
            // If the harden() call is its own ExpressionStatement,
            // delete the whole statement plus the indentation that
            // precedes it on the same line, so we don't leave a line
            // of trailing whitespace behind.
            const { parent } = node;
            if (
              parent &&
              parent.type === 'ExpressionStatement' &&
              parent.expression === node
            ) {
              const text = sourceCode.getText();
              const range = /** @type {[number, number]} */ (parent.range);
              let removeStart = range[0];
              const end = range[1];
              while (
                removeStart > 0 &&
                (text.charAt(removeStart - 1) === ' ' ||
                  text.charAt(removeStart - 1) === '\t')
              ) {
                removeStart -= 1;
              }
              return fixer.removeRange([removeStart, end]);
            }
            // Otherwise, replace `harden(x)` with `x`.
            return fixer.replaceText(node, sourceCode.getText(arg));
          },
        });
      },
    };
  },
};
