// @ts-check

/// <reference types="ses"/>

import '../types.js';
import './internal-types.js';
import { assertChecker } from './passStyle-helpers.js';

const { details: X } = assert;
const { getPrototypeOf, getOwnPropertyDescriptors } = Object;
const { ownKeys } = Reflect;

// TODO: Maintenance hazard: Coordinate with the list of errors in the SES
// whilelist. Currently, both omit AggregateError, which is now standard. Both
// must eventually include it.
const errorConstructors = new Map([
  ['Error', Error],
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError],
]);

export const getErrorConstructor = name => errorConstructors.get(name);
harden(getErrorConstructor);

/**
 * Validating error objects are passable raises a tension between security
 * vs preserving diagnostic information. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error test succeed and to couch these
 * complaints as notes on the error.
 *
 * To resolve this, such a malformed error object will still pass
 * `canBeValid(err)` with no check, so marshal can use this for top
 * level error to report from, even if it would not actually validate.
 * Instead, the diagnostics that `assertError` would have reported are
 * attached as notes to the malformed error. Thus, a malformed
 * error is passable by itself, but not as part of a passable structure.
 *
 * @type {PassStyleHelper}
 */
export const ErrorHelper = harden({
  styleName: 'error',

  canBeValid: (candidate, check = x => x) => {
    // TODO: Need a better test than instanceof
    if (!(candidate instanceof Error)) {
      return check(false, X`Error expected: ${candidate}`);
    }
    const proto = getPrototypeOf(candidate);
    const { name } = proto;
    const EC = getErrorConstructor(name);
    if (!EC || EC.prototype !== proto) {
      const note = X`Errors must inherit from an error class .prototype ${candidate}`;
      // Only terminate if check throws
      check(false, note);
      assert.note(candidate, note);
    }

    const {
      // Must allow `cause`, `errors`
      message: mDesc,
      // Allow but ignore only extraneous own `stack` property.
      stack: _optStackDesc,
      ...restDescs
    } = getOwnPropertyDescriptors(candidate);
    if (ownKeys(restDescs).length >= 1) {
      const note = X`Passed Error has extra unpassed properties ${restDescs}`;
      // Only terminate if check throws
      check(false, note);
      assert.note(candidate, note);
    }
    if (mDesc) {
      if (typeof mDesc.value !== 'string') {
        const note = X`Passed Error "message" ${mDesc} must be a string-valued data property.`;
        // Only terminate if check throws
        check(false, note);
        assert.note(candidate, note);
      }
      if (mDesc.enumerable) {
        const note = X`Passed Error "message" ${mDesc} must not be enumerable`;
        // Only terminate if check throws
        check(false, note);
        assert.note(candidate, note);
      }
    }
    return true;
  },

  assertValid: candidate => {
    ErrorHelper.canBeValid(candidate, assertChecker);
  },
});

/**
 * Return a new passable error that propagates the diagnostic info of the
 * original, and is linked to the original as a note.
 *
 * @param {Error} err
 * @returns {Error}
 */
export const toPassableError = err => {
  const { name, message } = err;

  const EC = getErrorConstructor(`${name}`) || Error;
  const newError = harden(new EC(`${message}`));
  // Even the cleaned up error copy, if sent to the console, should
  // cause hidden diagnostic information of the original error
  // to be logged.
  assert.note(newError, X`copied from error ${err}`);
  return newError;
};
harden(toPassableError);
