import { getEnvironmentOption } from '@endo/env-options';
import { Fail, hideAndHardenFunction } from '@endo/errors';
import { isWellFormedString } from '@endo/is-well-formed-string';

// `isWellFormedString` is factored out into its own leaf package
// (`@endo/is-well-formed-string`) so primitive codecs can depend on the
// well-formedness check without entraining `@endo/pass-style`, with a single
// canonical implementation rather than a copy per consumer. It is already
// hidden and hardened there; re-export it unchanged.
export { isWellFormedString };

/**
 * Returns normally when `isWellFormedString(str)` would return true.
 * Throws a diagnostic error when `isWellFormedString(str)` would return false.
 *
 * @param {unknown} str
 * @returns {asserts str is string}
 */
export const assertWellFormedString = str => {
  isWellFormedString(str) || Fail`Expected well-formed unicode string: ${str}`;
};
hideAndHardenFunction(assertWellFormedString);

const ONLY_WELL_FORMED_STRINGS_PASSABLE =
  getEnvironmentOption('ONLY_WELL_FORMED_STRINGS_PASSABLE', 'disabled', [
    'enabled',
  ]) === 'enabled';

/**
 * For now,
 * if `ONLY_WELL_FORMED_STRINGS_PASSABLE` environment option is `'enabled'`,
 * then `assertPassableString` is the same as `assertWellFormedString`.
 * Otherwise `assertPassableString` just asserts that `str` is a string.
 *
 * Currently, `ONLY_WELL_FORMED_STRINGS_PASSABLE` defaults to `'disabled'`
 * because we do not yet know the performance impact. Later, if we decide we
 * can afford it, we'll first change the default to `'enabled'` and ultimately
 * remove the switch altogether. Be prepared for these changes.
 *
 * TODO once the switch is removed, simplify `assertPassableString` to
 * simply be `assertWellFormedString`.
 *
 * @param { unknown } str
 * @returns {asserts str is string }
 */
export const assertPassableString = str => {
  typeof str === 'string' || Fail`Expected string ${str}`;
  !ONLY_WELL_FORMED_STRINGS_PASSABLE || assertWellFormedString(str);
};
hideAndHardenFunction(assertPassableString);
