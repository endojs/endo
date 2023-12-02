/// <reference types="ses"/>

import { assertChecker } from './passStyle-helpers.js';

/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Checker} Checker */

const { details: X, Fail } = assert;
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
 * @param {unknown} candidate
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkErrorLike = (candidate, check = undefined) => {
  const reject = !!check && (details => check(false, details));
  // TODO: Need a better test than instanceof
  return (
    candidate instanceof Error ||
    (reject && reject(X`Error expected: ${candidate}`))
  );
};
harden(checkErrorLike);

/**
 * Validating error objects are passable raises a tension between security
 * vs preserving diagnostic information. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error-like test succeed and to couch these
 * complaints as notes on the error.
 *
 * To resolve this, such a malformed error object will still pass
 * `isErrorLike` so marshal can use this for top level error to report from,
 * even if it would not actually validate.
 * Instead, the diagnostics that `assertError` would have reported are
 * attached as notes to the malformed error. Thus, a malformed
 * error is passable by itself, but not as part of a passable structure.
 *
 * @param {unknown} candidate
 * @returns {boolean}
 */
export const isErrorLike = candidate => checkErrorLike(candidate);
harden(isErrorLike);

/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper = harden({
  styleName: 'error',

  canBeValid: checkErrorLike,

  assertValid: candidate => {
    ErrorHelper.canBeValid(candidate, assertChecker);
    const proto = getPrototypeOf(candidate);
    const { name } = proto;
    const EC = getErrorConstructor(name);
    (EC && EC.prototype === proto) ||
      Fail`Errors must inherit from an error class .prototype ${candidate}`;

    const {
      // TODO Must allow `cause`, `errors`
      message: mDesc,
      stack: stackDesc,

      // workaround
      columnNumber: _cn,
      fileName: _fn,
      lineNumber: _ln,

      ...restDescs
    } = getOwnPropertyDescriptors(candidate);
    ownKeys(restDescs).length < 1 ||
      Fail`Passed Error has extra unpassed properties ${restDescs}`;
    if (mDesc) {
      typeof mDesc.value === 'string' ||
        Fail`Passed Error "message" ${mDesc} must be a string-valued data property.`;
      !mDesc.enumerable ||
        Fail`Passed Error "message" ${mDesc} must not be enumerable`;
    }
    if (stackDesc) {
      typeof stackDesc.value === 'string' ||
        Fail`Passed Error "stack" ${stackDesc} must be a string-valued data property.`;
      !stackDesc.enumerable ||
        Fail`Passed Error "stack" ${stackDesc} must not be enumerable`;
    }
    return true;
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
