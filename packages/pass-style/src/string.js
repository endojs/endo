import { getEnvironmentOption } from '@endo/env-options';
import { Fail } from '@endo/errors';

// @ts-expect-error TS builtin `String` type does not yet
// know about`isWellFormed`
const hasWellFormedStringMethod = !!String.prototype.isWellFormed;

/**
 * Is the argument a well-formed string?
 *
 * Unfortunately, the
 * [standard built-in `String.prototype.isWellFormed`](https://github.com/tc39/proposal-is-usv-string)
 * does a ToString on its input, causing it to judge non-strings to be
 * well-formed strings if they coerce to a well-formed strings. This
 * recapitulates the mistake in having the global `isNaN` coerce its inputs,
 * causing it to judge non-string to be NaN if they coerce to NaN.
 *
 * This `isWellFormedString` function only judges well-formed strings to be
 * well-formed strings. For all non-strings it returns false.
 *
 * @param {unknown} str
 * @returns {str is string}
 */
export const isWellFormedString = hasWellFormedStringMethod
  ? // @ts-expect-error TS does not yet know about `isWellFormed`
    str => typeof str === 'string' && str.isWellFormed()
  : str => {
      if (typeof str !== 'string') {
        return false;
      }
      for (const ch of str) {
        // The string iterator iterates by Unicode code point, not
        // UTF16 code unit. But if it encounters an unpaired surrogate,
        // it will produce it.
        const cp = /** @type {number} */ (ch.codePointAt(0));
        if (cp >= 0xd800 && cp <= 0xdfff) {
          // All surrogates are in this range. The string iterator only
          // produces a character in this range for unpaired surrogates,
          // which only happens if the string is not well-formed.
          return false;
        }
      }
      return true;
    };
harden(isWellFormedString);

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
harden(assertWellFormedString);

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
 * TODO update https://github.com/Agoric/agoric-sdk/blob/master/docs/env.md
 * which is unfortunately in the wrong repo to be updated in the same change.
 *
 * @param { unknown } str
 * @returns {asserts str is string }
 */
export const assertPassableString = str => {
  typeof str === 'string' || Fail`Expected string ${str}`;
  !ONLY_WELL_FORMED_STRINGS_PASSABLE || assertWellFormedString(str);
};
harden(assertPassableString);
