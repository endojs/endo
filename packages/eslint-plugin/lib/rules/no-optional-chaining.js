/** @author Yosuke Ota <https://github.com/ota-meshi> */
'use strict';

// Agoric still uses Endo dependencies under an emulation of ESM we call RESM
// because it is invoked with `node -r esm`.
// RESM does not support ?? nor ?. operators, so we must avoid them expressly.
// TODO remove when https://github.com/Agoric/agoric-sdk/issues/8671

module.exports = {
  meta: {
    docs: {
      description: 'disallow optional chaining.',
      category: 'ES2020',
      recommended: false,
      url: 'http://mysticatea.github.io/eslint-plugin-es/rules/no-optional-chaining.html',
    },
    fixable: null,
    messages: {
      forbidden: 'ES2020 optional chaining is forbidden.',
    },
    schema: [],
    type: 'problem',
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    /**
     * @param {Token} token The token to check.
     * @returns {boolean} whether the token is a `?.` token.
     */
    function isQuestionDotToken(token) {
      return (
        token.value === '?.' &&
        (token.type === 'Punctuator' || // espree has been parsed well.
          // espree@7.1.0 doesn't parse "?." tokens well. Therefore, get the string from the source code and check it.
          sourceCode.getText(token) === '?.')
      );
    }

    return {
      'CallExpression[optional=true]'(node) {
        context.report({
          node: sourceCode.getTokenAfter(node.callee, isQuestionDotToken),
          messageId: 'forbidden',
        });
      },
      'MemberExpression[optional=true]'(node) {
        context.report({
          node: sourceCode.getTokenAfter(node.object, isQuestionDotToken),
          messageId: 'forbidden',
        });
      },
    };
  },
};
