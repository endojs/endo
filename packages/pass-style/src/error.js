/// <reference types="ses"/>

import { q } from '@endo/errors';
import { assertChecker, isObject, CX } from './passStyle-helpers.js';

/** @import {PassStyleHelper} from './internal-types.js' */
/** @import {Checker, PassStyle, CopyTagged, Passable} from './types.js' */

const { getPrototypeOf, getOwnPropertyDescriptors, hasOwn, entries, values } =
  Object;

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
    // Likewise https://github.com/tc39/proposal-explicit-resource-management
    // ['SuppressedError', SuppressedError],
  ]),
);

if (typeof AggregateError !== 'undefined') {
  // Conditional, to accommodate platforms prior to AggregateError
  errorConstructors.set('AggregateError', AggregateError);
}

if (typeof SuppressedError !== 'undefined') {
  // Conditional, to accommodate platforms prior to SuppressedError
  errorConstructors.set('SuppressedError', SuppressedError);
}

/**
 * Because the error constructor returned by this function might be
 * `AggregateError` or `SuppressedError`,
 * each of which has different construction parameters
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
  // TODO: Need a better test than instanceof
  return (
    candidate instanceof Error ||
    (!!check && CX(check)`Error expected: ${candidate}`)
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
 * An own property of a passable error must be a data property whose value is
 * a throwable value.
 *
 * @param {string} propName
 * @param {PropertyDescriptor} desc
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkRecursivelyPassableErrorOwnPropertyDesc = (
  propName,
  desc,
  passStyleOfRecur,
  check = undefined,
) => {
  if (!hasOwn(desc, 'value')) {
    return (
      !!check &&
      CX(check)`Passable Error ${q(
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
        (!!check &&
          CX(check)`Passable Error ${q(
            propName,
          )} own property must be a string: ${value}`)
      );
    }
    default: {
      break;
    }
  }
  // eslint-disable-next-line no-use-before-define
  return checkRecursivelyThrowable(value, passStyleOfRecur, check);
};
harden(checkRecursivelyPassableErrorOwnPropertyDesc);

/**
 * `candidate` is throwable if it contains only data and passable errors.
 *
 * @param {unknown} candidate
 * @param {(val: any) => PassStyle} passStyleOfRecur
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkRecursivelyThrowable = (
  candidate,
  passStyleOfRecur,
  check = undefined,
) => {
  if (checkErrorLike(candidate, undefined)) {
    const proto = getPrototypeOf(candidate);
    const { name } = proto;
    const errConstructor = getErrorConstructor(name);
    if (errConstructor === undefined || errConstructor.prototype !== proto) {
      return (
        !!check &&
        CX(
          check,
        )`Passable Error must inherit from an error class .prototype: ${candidate}`
      );
    }
    const descs = getOwnPropertyDescriptors(candidate);
    if (!('message' in descs)) {
      return (
        !!check &&
        CX(
          check,
        )`Passable Error must have an own "message" string property: ${candidate}`
      );
    }

    return entries(descs).every(([propName, desc]) =>
      checkRecursivelyPassableErrorOwnPropertyDesc(
        propName,
        desc,
        passStyleOfRecur,
        check,
      ),
    );
  }
  const passStyle = passStyleOfRecur(candidate);
  if (!isObject(candidate)) {
    // All passable primitives are throwable
    return true;
  }
  switch (passStyle) {
    case 'copyArray': {
      return /** @type {Passable[]} */ (candidate).every(element =>
        checkRecursivelyThrowable(element, passStyleOfRecur, check),
      );
    }
    case 'copyRecord': {
      return values(/** @type {Record<string,any>} */ (candidate)).every(
        value => checkRecursivelyThrowable(value, passStyleOfRecur, check),
      );
    }
    case 'tagged': {
      return checkRecursivelyThrowable(
        /** @type {CopyTagged} */ (candidate).payload,
        passStyleOfRecur,
        check,
      );
    }
    default: {
      return (
        !!check &&
        CX(check)`A throwable cannot contain a ${q(passStyle)}: ${candidate}`
      );
    }
  }
};
harden(checkRecursivelyThrowable);

/**
 * A passable error is a throwable error and contains only throwable values.
 *
 * @type {PassStyleHelper}
 */
export const ErrorHelper = harden({
  styleName: 'error',

  canBeValid: checkErrorLike,

  assertValid: (candidate, passStyleOfRecur) =>
    checkErrorLike(candidate, assertChecker) &&
    checkRecursivelyThrowable(candidate, passStyleOfRecur, assertChecker),
});
