// @ts-check
import { hideAndHardenFunction } from '@endo/errors';

import { isWellFormedStringFallback } from './fallback.js';

// Capture the intrinsic once, at module initialization, and call it through
// that captured binding rather than re-looking it up on the receiver at each
// call. The presence test and the call must observe the same binding: before
// `lockdown()` freezes the intrinsics, an embedder that replaces
// `String.prototype.isWellFormed` in between would silently redefine this
// package's guarantee for every consumer downstream of it.
const isWellFormedMethod = String.prototype.isWellFormed;
const hasWellFormedStringMethod = !!isWellFormedMethod;

// The two arms are selected once, here, and the exported predicate below
// delegates to whichever was chosen. Keeping the conditional in a private
// binding is load-bearing for the TYPES, not only for tidiness: TypeScript
// honors a JSDoc `@param`/`@returns` block only above a function declaration or
// a direct function/arrow expression. Above a `const` whose initializer is a
// conditional it discards the annotation and infers instead, which is how the
// declared `str is string` type predicate previously emitted as the useless
// `(str: any) => boolean`, denying every consumer the narrowing.
const isWellFormedStringInternal = hasWellFormedStringMethod
  ? str => typeof str === 'string' && Reflect.apply(isWellFormedMethod, str, [])
  : isWellFormedStringFallback;

/**
 * Is the argument a well-formed string?
 *
 * This is a ponyfill for the
 * [standard built-in `String.prototype.isWellFormed`](https://github.com/tc39/proposal-is-usv-string):
 * it uses the engine-native method when present and falls back to a manual
 * surrogate scan otherwise, so it is correct on engines (XS among them) that do
 * not yet carry the built-in. It lives in its own leaf package so that a
 * primitive codec can take the check without entraining a heavier dependency,
 * reaching for the native method directly, or carrying a private copy.
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
export const isWellFormedString = str => isWellFormedStringInternal(str);
hideAndHardenFunction(isWellFormedString);
