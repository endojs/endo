import { importsRules, importsSettings } from './shared.js';

/**
 * Legacy eslintrc-style `imports` config — opinionated rules for how packages
 * should use ES module imports (via `eslint-plugin-import`).
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  plugins: ['import'],
  settings: importsSettings,
  rules: importsRules,
};
