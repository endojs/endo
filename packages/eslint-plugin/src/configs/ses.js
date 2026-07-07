import { sesRules, sesTestOverrideRules } from './shared.js';

/**
 * Legacy eslintrc-style `ses` config — additional restrictions for SES and its
 * direct dependencies that must survive initialization before `lockdown()` is
 * called.
 *
 * Forbids consulting `globalThis` and calling methods on intrinsics (which may
 * be overridden before lockdown). Only intended for packages that run very
 * early in the SES bootstrap.
 *
 * @see {@link https://github.com/endojs/endo/blob/master/packages/eslint-plugin/README.md}
 */
export default {
  extends: ['plugin:@endo/internal'],
  rules: sesRules,
  overrides: [
    {
      files: ['test/**/*.js', 'demos/**/*.js', 'scripts/**/*.js'],
      rules: sesTestOverrideRules,
    },
  ],
};
