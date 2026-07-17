/**
 * Legacy eslintrc-style config that augments `recommended` with rules
 * requiring TypeScript type information.
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  extends: ['plugin:@endo/recommended'],
  rules: {
    '@endo/restrict-comparison-operands': 'error',
  },
};
