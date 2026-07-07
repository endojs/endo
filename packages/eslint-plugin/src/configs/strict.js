/**
 * Legacy eslintrc-style `strict` config — combines `style`, `imports`, and
 * `recommended`.
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  extends: [
    'plugin:@endo/style',
    'plugin:@endo/imports',
    'plugin:@endo/recommended',
  ],
};
