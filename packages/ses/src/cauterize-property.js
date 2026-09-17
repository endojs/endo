import { hasOwn } from './commons.js';

/**
 * @import {Reporter} from './reporting-types.js'
 */

/**
 * Delete `obj[prop]` or at least make it harmless.
 *
 * If the property was not expected, then emit a reporter-dependent warning
 * to bring attention to this case, so someone can determine what to do with it.
 *
 * If the property to be deleted is a function's `.prototype` property, this
 * will normally be because the function was supposed to be a
 * - builtin method or non-constructor function
 * - arrow function
 * - concise method
 *
 * all of whom are not supposed to have a `.prototype` property. Nevertheless,
 * on some platforms (like older versions of Hermes), or as a result of
 * some shim-based mods to the primordials (like core-js?), some of these
 * functions may accidentally be more like `function` functions with
 * an undeletable `.prototype` property. In these cases, if we can
 * set the value of that bogus `.prototype` property to `undefined`,
 * we do so, rather than failing to initialize ses.
 *
 * This is the canonical statement of the `known` / `false`-permit contract
 * shared by the permit tables (`permits.js`, `permits-intrinsics.js`), which
 * point here rather than restate it:
 *
 * A removal is `known` when the permit is specifically `false` (not merely
 * absent) — a property we know exists in some environments and have expressly
 * audited and decided to drop. A `known` removal is silent: both the
 * `Removing ...` warning and the `Tolerating undeletable ... === undefined`
 * warning are suppressed, because the removal (or the `.prototype = undefined`
 * fallback) is the fully-intended outcome and needs no attention. Any other
 * disallowed property is unaudited, so we warn to bring attention to it, as
 * happens when the language evolves new features on existing intrinsics.
 *
 * @param {object} obj
 * @param {PropertyKey} prop
 * @param {boolean} known Whether the removal is expressly expected (a `false`
 * permit); when `true`, both warnings above are suppressed.
 * @param {string} subPath Used for warning messages
 * @param {Reporter} reporter Where to issue warning or error.
 * @returns {void}
 */
export const cauterizeProperty = (
  obj,
  prop,
  known,
  subPath,
  { warn, error },
) => {
  // Warn only for an unaudited removal; a `known` (`false`-permit) exclusion is
  // silent — see the `known` @param above.
  if (!known) {
    warn(`Removing ${subPath}`);
  }
  try {
    delete obj[prop];
  } catch (err) {
    const reason = /** @type {string | object} */ (err);
    if (hasOwn(obj, prop)) {
      if (typeof obj === 'function' && prop === 'prototype') {
        obj.prototype = undefined;
        if (obj.prototype === undefined) {
          // Silent when `known`, mirroring the `Removing` warning above.
          if (!known) {
            warn(`Tolerating undeletable ${subPath} === undefined`);
          }
          return;
        }
      }
      error(`failed to delete ${subPath}`, reason);
    } else {
      error(`deleting ${subPath} threw`, reason);
    }
    throw err;
  }
};
