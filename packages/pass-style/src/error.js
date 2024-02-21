/// <reference types="ses"/>

import { X, q } from '@endo/errors';
import { assertChecker } from './passStyle-helpers.js';

/** @typedef {import('./internal-types.js').PassStyleHelper} PassStyleHelper */
/** @typedef {import('./types.js').Checker} Checker */

const { getPrototypeOf, getOwnPropertyDescriptors, hasOwn, entries } = Object;

// TODO: Maintenance hazard: Coordinate with the list of errors in the SES
// whilelist.
const errorConstructors = new Map(
  // Cast because otherwise TS is confused by AggregateError
  // See https://github.com/endojs/endo/pull/2042#discussion_r1484933028
  /** @type {Array<[string, import('ses').GenericErrorConstructor]>} */
  ([
    ['Error', Error],
    ['EvalError', EvalError],
    ['RangeError', RangeError],
    ['ReferenceError', ReferenceError],
    ['SyntaxError', SyntaxError],
    ['TypeError', TypeError],
    ['URIError', URIError],

    // https://github.com/endojs/endo/issues/550
    // To accommodate platforms prior to AggregateError, we comment out the
    // following line and instead conditionally add it to the map below.
    // ['AggregateError', AggregateError],
  ]),
);

if (typeof AggregateError !== 'undefined') {
  // Conditional, to accommodate platforms prior to AggregateError
  errorConstructors.set('AggregateError', AggregateError);
}

/**
 * Because the error constructor returned by this function might be
 * `AggregateError`, which has different construction parameters
 * from the other error constructors, do not use it directly to try
 * to make an error instance. Rather, use `makeError` which encapsulates
 * this non-uniformity.
 *
 * @param {string} name
 * @returns {import('ses').GenericErrorConstructor | undefined}
 */
export const getErrorConstructor = name => errorConstructors.get(name);
harden(getErrorConstructor);

/**
 * @param {unknown} candidate
 * @param {Checker} [check]
 * @returns {boolean}
 */
const checkErrorLike = (candidate, check = undefined) => {
  const reject = !!check && ((T, ...subs) => check(false, X(T, ...subs)));
  // TODO: Need a better test than instanceof
  return (
    candidate instanceof Error ||
    (reject && reject`Error expected: ${candidate}`)
  );
};
harden(checkErrorLike);
/// <reference types="ses"/>

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
 * @param {string} propName
 * @param {PropertyDescriptor} desc
 * @param {import('./internal-types.js').PassStyleOf} passStyleOfRecur
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkRecursivelyPassableErrorPropertyDesc = (
  propName,
  desc,
  passStyleOfRecur,
  check = undefined,
) => {
  const reject = !!check && ((T, ...subs) => check(false, X(T, ...subs)));
  if (desc.enumerable) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must not be enumerable: ${desc}`
    );
  }
  if (!hasOwn(desc, 'value')) {
    return (
      reject &&
      reject`Passable Error ${q(
        propName,
      )} own property must be a data property: ${desc}`
    );
  }
  const { value } = desc;
  switch (propName) {
    case 'message':
    case 'stack': {
      return (
        typeof value === 'string' ||
        (reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a string: ${value}`)
      );
    }
    case 'cause': {
      // eslint-disable-next-line no-use-before-define
      return checkRecursivelyPassableError(value, passStyleOfRecur, check);
    }
    case 'errors': {
      if (!Array.isArray(value) || passStyleOfRecur(value) !== 'copyArray') {
        return (
          reject &&
          reject`Passable Error ${q(
            propName,
          )} own property must be a copyArray: ${value}`
        );
      }
      return value.every(err =>
        // eslint-disable-next-line no-use-before-define
        checkRecursivelyPassableError(err, passStyleOfRecur, check),
      );
    }
    default: {
      break;
    }
  }
  return (
    reject && reject`Passable Error has extra unpassed property ${q(propName)}`
  );
};
harden(checkRecursivelyPassableErrorPropertyDesc);

/**
 * @param {unknown} candidate
 * @param {import('./internal-types.js').PassStyleOf} passStyleOfRecur
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkRecursivelyPassableError = (
  candidate,
  passStyleOfRecur,
  check = undefined,
) => {
  const reject = !!check && ((T, ...subs) => check(false, X(T, ...subs)));
  if (!checkErrorLike(candidate, check)) {
    return false;
  }
  const proto = getPrototypeOf(candidate);
  const { name } = proto;
  const errConstructor = getErrorConstructor(name);
  if (errConstructor === undefined || errConstructor.prototype !== proto) {
    return (
      reject &&
      reject`Passable Error must inherit from an error class .prototype: ${candidate}`
    );
  }
  const descs = getOwnPropertyDescriptors(candidate);
  if (!('message' in descs)) {
    return (
      reject &&
      reject`Passable Error must have an own "message" string property: ${candidate}`
    );
  }

  return entries(descs).every(([propName, desc]) =>
    checkRecursivelyPassableErrorPropertyDesc(
      propName,
      desc,
      passStyleOfRecur,
      check,
    ),
  );
};
harden(checkRecursivelyPassableError);

/**
 * @type {PassStyleHelper}
 */
export const ErrorHelper = harden({
  styleName: 'error',

  canBeValid: checkErrorLike,

  assertValid: (candidate, passStyleOfRecur) =>
    checkRecursivelyPassableError(candidate, passStyleOfRecur, assertChecker),
});
