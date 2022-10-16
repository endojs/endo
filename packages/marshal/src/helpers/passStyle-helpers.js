// @ts-check

/// <reference types="ses"/>

/** @typedef {import('../types.js').Checker} Checker */
/** @typedef {import('../types.js').PassStyle} PassStyle */

const { details: X, quote: q } = assert;
const { isArray } = Array;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  hasOwnProperty: objectHasOwnProperty,
  isFrozen,
} = Object;
const { apply } = Reflect;
const { toStringTag: toStringTagSymbol } = Symbol;

const typedArrayPrototype = getPrototypeOf(Uint8Array.prototype);
const typedArrayToStringTagDesc = getOwnPropertyDescriptor(
  typedArrayPrototype,
  toStringTagSymbol,
);
assert(typedArrayToStringTagDesc);
const getTypedArrayToStringTag = typedArrayToStringTagDesc.get;
assert(typeof getTypedArrayToStringTag === 'function');

export const hasOwnPropertyOf = (obj, prop) =>
  apply(objectHasOwnProperty, obj, [prop]);
harden(hasOwnPropertyOf);

export const isObject = val => Object(val) === val;
harden(isObject);

/**
 * Duplicates packages/ses/src/make-hardener.js to avoid a dependency.
 *
 * @param {unknown} object
 */
export const isTypedArray = object => {
  // The object must pass a brand check or toStringTag will return undefined.
  const tag = apply(getTypedArrayToStringTag, object, []);
  return tag !== undefined;
};
harden(isTypedArray);

export const PASS_STYLE = Symbol.for('passStyle');

/**
 * For a function to be a valid method, it must not be passable.
 * Otherwise, we risk confusing pass-by-copy data carrying
 * far functions with attempts at far objects with methods.
 *
 * TODO HAZARD Because we check this on the way to hardening a remotable,
 * we cannot yet check that `func` is hardened. However, without
 * doing so, it's inheritance might change after the `PASS_STYLE`
 * check below.
 *
 * @param {any} func
 * @returns {boolean}
 */
export const canBeMethod = func =>
  typeof func === 'function' && !(PASS_STYLE in func);
harden(canBeMethod);

/**
 * Below we have a series of predicate functions and their (curried) assertion
 * functions. The semantics of the assertion function is just to assert that
 * the corresponding predicate function would have returned true. But it
 * reproduces the internal tests so failures can give a better error message.
 *
 * @type {Checker}
 */
export const assertChecker = (cond, details) => {
  assert(cond, details);
  return true;
};
harden(assertChecker);

/**
 * Checks for the presence and enumerability of an own data property.
 *
 * @param {Object} candidate
 * @param {string|number|symbol} propertyName
 * @param {boolean} shouldBeEnumerable
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkNormalProperty = (
  candidate,
  propertyName,
  shouldBeEnumerable,
  check,
) => {
  const reject = !!check && (details => check(false, details));
  const desc = getOwnPropertyDescriptor(candidate, propertyName);
  if (desc === undefined) {
    return (
      reject && reject(X`${q(propertyName)} property expected: ${candidate}`)
    );
  }
  return (
    (hasOwnPropertyOf(desc, 'value') ||
      (reject &&
        reject(
          X`${q(propertyName)} must not be an accessor property: ${candidate}`,
        ))) &&
    (shouldBeEnumerable
      ? desc.enumerable ||
        (reject &&
          reject(
            X`${q(propertyName)} must be an enumerable property: ${candidate}`,
          ))
      : !desc.enumerable ||
        (reject &&
          reject(
            X`${q(
              propertyName,
            )} must not be an enumerable property: ${candidate}`,
          )))
  );
};
harden(checkNormalProperty);

export const getTag = tagRecord => tagRecord[Symbol.toStringTag];
harden(getTag);

/**
 * @param {{ [PASS_STYLE]: string }} tagRecord
 * @param {PassStyle} passStyle
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkTagRecord = (tagRecord, passStyle, check) => {
  const reject = !!check && (details => check(false, details));
  return (
    (isObject(tagRecord) ||
      (reject &&
        reject(X`A non-object cannot be a tagRecord: ${tagRecord}`))) &&
    (isFrozen(tagRecord) ||
      (reject && reject(X`A tagRecord must be frozen: ${tagRecord}`))) &&
    (!isArray(tagRecord) ||
      (reject && reject(X`An array cannot be a tagRecords: ${tagRecord}`))) &&
    checkNormalProperty(tagRecord, PASS_STYLE, false, check) &&
    (tagRecord[PASS_STYLE] === passStyle ||
      (reject &&
        reject(
          X`Expected ${q(passStyle)}, not ${q(
            tagRecord[PASS_STYLE],
          )}: ${tagRecord}`,
        ))) &&
    checkNormalProperty(tagRecord, Symbol.toStringTag, false, check) &&
    (typeof getTag(tagRecord) === 'string' ||
      (reject &&
        reject(
          X`A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`,
        )))
  );
};
harden(checkTagRecord);
