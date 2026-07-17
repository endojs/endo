import { createRule } from '../create-rule.js';

/**
 * @import {TSESTree} from '@typescript-eslint/types';
 */

/**
 * Produces a human-readable hint for a `MemberExpression` node, used in
 * the error message to identify the polymorphic call site.
 * @param {TSESTree.MemberExpressionComputedName|TSESTree.MemberExpressionNonComputedName} node
 */
const prepareMemberExpressionHint = node => {
  const { object, property, computed } = node;
  let objectHint;
  let propertyHint;

  if (object.type === 'Identifier') {
    objectHint = object.name;
  } else if (object.type === 'MemberExpression') {
    objectHint = prepareMemberExpressionHint(object);
  } else {
    objectHint = `[[${object.type}]]`;
  }

  if (property.type === 'Identifier') {
    propertyHint = computed ? `[${property.name}]` : property.name;
  } else {
    propertyHint = `[[${property.type}]]`;
  }

  return `${objectHint}.${propertyHint}`;
};

export default createRule({
  name: 'no-polymorphic-call',
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow polymorphic method calls (e.g. `array.slice()`) which may be corrupted or trapped.',
    },
    fixable: undefined,
    schema: [],
    messages: {
      polymorphicCall:
        'Polymorphic call: "{{hint}}". May be vulnerable to corruption or trap',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression') {
          return;
        }
        context.report({
          node,
          messageId: 'polymorphicCall',
          data: { hint: prepareMemberExpressionHint(node.callee) },
        });
      },
    };
  },
});
