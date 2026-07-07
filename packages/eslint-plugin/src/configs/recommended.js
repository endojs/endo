import { hardenedGlobals, recommendedRules } from './shared.js';

/**
 * Legacy eslintrc-style `recommended` config for Hardened JS code.
 *
 * Enables Endo's custom rules for Hardened JS. Note: this config no longer
 * bundles `@jessie.js/eslint-plugin`; consumers that want the Jessie
 * `safe-await-separator` rule and `use-jessie` processor must install
 * `@jessie.js/eslint-plugin` and wire it up themselves.
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  plugins: ['@endo'],
  env: {
    es6: true,
    node: false,
    commonjs: false,
  },
  globals: hardenedGlobals,
  rules: recommendedRules,
};
