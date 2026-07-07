import { styleRules, styleTsOverrideRules, styleSettings } from './shared.js';

/**
 * Legacy eslintrc-style `style` config — opinionated JS coding style rules
 * (@stylistic, jsdoc, prettier).
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  extends: ['plugin:jsdoc/recommended-typescript-flavor', 'prettier'],
  rules: styleRules,
  overrides: [
    {
      files: ['**/*.ts'],
      rules: styleTsOverrideRules,
    },
  ],
  settings: styleSettings,
};
