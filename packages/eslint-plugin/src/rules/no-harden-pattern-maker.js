// @ts-nocheck
import { createRule } from '../create-rule.js';

/**
 * Returns `true` when the node is a `CallExpression` of the form `M.something(...)`.
 * This is the conservative heuristic used by `harden-exports` to detect Pattern makers;
 * we keep it identical so the two rules stay in sync.
 * @param node
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

export default createRule({
  name: 'no-harden-pattern-maker',
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow `harden()` on values returned by Pattern makers (`M.*`) which are already hardened.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      unnecessaryHardenOfPatternMaker:
        'harden() is unnecessary for values returned by Pattern makers (M.*) which are already hardened.',
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    /**
     * Returns `true` when `name` resolves in the surrounding scope to a
     * binding whose single initializer is a Pattern maker call.
     * @param idNode
     * @param contextNode
     */
    const identifierBoundToPatternMaker = (idNode, contextNode) => {
      const scope =
        (sourceCode.getScope && sourceCode.getScope(contextNode)) ??
        context.getScope();
      let current = scope;
      while (current) {
        const variable = current.variables.find(v => v.name === idNode.name);
        if (variable) {
          for (const def of variable.defs) {
            if (
              def.type === 'Variable' &&
              def.node &&
              def.node.type === 'VariableDeclarator' &&
              isPatternMakerCall(def.node.init ?? undefined)
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
          identifierBoundToPatternMaker(arg, node)
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
            const parent = node.parent;
            if (
              parent?.type === 'ExpressionStatement' &&
              parent.expression === node
            ) {
              const text = sourceCode.getText();
              const range = parent.range;
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
            return fixer.replaceText(node, sourceCode.getText(arg));
          },
        });
      },
    };
  },
});
