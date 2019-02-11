module.exports = {
  extends: ['airbnb', 'plugin:prettier/recommended'],
  env: {
    es6: true,
    mocha: true,
  },
  rules: {
    'implicit-arrow-linebreak': 'off',
    'function-paren-newline': 'off',
    'arrow-parens': 'off',

    /// temporarily turn off until a decision is made
    'prefer-arrow-callback': 'off',
    strict: 'off',
  },
};

