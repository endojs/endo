// @ts-check
import { hideAndHardenFunction } from '@endo/errors';

// know about `isWellFormed`
const hasWellFormedStringMethod = !!String.prototype.isWellFormed;

/**
 * Is the argument a well-formed string?
 *
 * This is a ponyfill for the
 * [standard built-in `String.prototype.isWellFormed`](https://github.com/tc39/proposal-is-usv-string):
 * it uses the engine-native method when present and falls back to a manual
 * surrogate scan otherwise, so it is correct on engines (XS among them) that do
 * not yet carry the built-in. `@endo/cbor` and other primitive codecs depend on
 * this shared home rather than reaching for the native method directly or
 * carrying a private copy of the check.
 *
 * Unfortunately, the standard built-in `String.prototype.isWellFormed` does a
 * ToString on its input, causing it to judge non-strings to be well-formed
 * strings if they coerce to a well-formed string. This recapitulates the mistake
 * in having the global `isNaN` coerce its inputs, causing it to judge non-string
 * to be NaN if they coerce to NaN.
 *
 * This `isWellFormedString` function only judges well-formed strings to be
 * well-formed strings. For all non-strings it returns false.
 *
 * @param {unknown} str
 * @returns {str is string}
 */
export const isWellFormedString = hasWellFormedStringMethod
  ? str => typeof str === 'string' && str.isWellFormed()
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
hideAndHardenFunction(isWellFormedString);
