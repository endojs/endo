'use strict';

// Agoric still uses Endo dependencies under an emulation of ESM we call RESM
// because it is invoked with `node -r esm`.
// RESM does not support ?? nor ?. operators, so we must avoid them expressly.
// TODO remove when https://github.com/Agoric/agoric-sdk/issues/8671

module.exports = {
  meta: {
    docs: {
      description: 'disallow nullish coalescing.',
      category: 'ES2020',
      recommended: false,
      url: 'https://github.com/endojs/endo/blob/master/packages/eslint-plugin/lib/rules/no-nullish-coalescing.js',
    },
    fixable: null,
    messages: {
      forbidden: 'ES2020 nullish coalescing is forbidden.',
    },
    schema: [],
    type: 'problem',
  },
  create(context) {
    return {
      LogicalExpression(node) {
        if (node.operator === '??') {
          context.report({
            node,
            messageId: 'forbidden',
          });
        }
      },
    };
  },
};
