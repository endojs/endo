/// <reference types="ses"/>

/** @import {Checker} from './types.js' */
/** @import {PassStyle} from './types.js' */

import { X, q } from '@endo/errors';

const { isArray } = Array;
const { prototype: functionPrototype } = Function;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  hasOwnProperty: objectHasOwnProperty,
  isFrozen,
  prototype: objectPrototype,
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

// TODO try typing this; `=> val is {} too narrow, implies no properties
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
 * Returns a template literal tag function to fail the provided Checker with details.
 * The name must be short for ergonomic inline use as in:
 * ```
 * return checkCondition(...) || (!!check && CX(check)`...`);
 * ```
 *
 * @param {Checker} check
 */
export const CX = check => {
  const reject = (T, ...subs) => check(false, X(T, ...subs));
  return reject;
};
harden(CX);

/**
 * Checks for the presence and enumerability of an own data property.
 *
 * @param {object} candidate
 * @param {string|number|symbol} propName
 * @param {boolean} shouldBeEnumerable
 * @param {Checker} [check]
 * @returns {boolean}
 */
export const checkNormalProperty = (
  candidate,
  propName,
  shouldBeEnumerable,
  check,
) => {
  const desc = getOwnPropertyDescriptor(candidate, propName);
  if (desc === undefined) {
    return !!check && CX(check)`${q(propName)} property expected: ${candidate}`;
  }
  return (
    (hasOwnPropertyOf(desc, 'value') ||
      (!!check &&
        CX(
          check,
        )`${q(propName)} must not be an accessor property: ${candidate}`)) &&
    (shouldBeEnumerable
      ? desc.enumerable ||
        (!!check &&
          CX(
            check,
          )`${q(propName)} must be an enumerable property: ${candidate}`)
      : !desc.enumerable ||
        (!!check &&
          CX(check)`${q(propName)} must not be an enumerable property: ${candidate}`))
  );
};
harden(checkNormalProperty);

/**
 * @template {import('./types.js').InterfaceSpec} T
 * @param {import('./types.js').PassStyled<any, T>} tagRecord
 * @returns {T}
 */
export const getTag = tagRecord => tagRecord[Symbol.toStringTag];
harden(getTag);

export const checkPassStyle = (obj, expectedPassStyle, check) => {
  const actual = obj[PASS_STYLE];
  return (
    actual === expectedPassStyle ||
    (!!check &&
      CX(check)`Expected ${q(expectedPassStyle)}, not ${q(actual)}: ${obj}`)
  );
};
harden(checkPassStyle);

const makeCheckTagRecord = checkProto => {
  /**
   * @param {import('./types.js').PassStyled<any, any>} tagRecord
   * @param {PassStyle} passStyle
   * @param {Checker} [check]
   * @returns {boolean}
   */
  const checkTagRecord = (tagRecord, passStyle, check) => {
    return (
      (isObject(tagRecord) ||
        (!!check &&
          CX(check)`A non-object cannot be a tagRecord: ${tagRecord}`)) &&
      (isFrozen(tagRecord) ||
        (!!check && CX(check)`A tagRecord must be frozen: ${tagRecord}`)) &&
      (!isArray(tagRecord) ||
        (!!check &&
          CX(check)`An array cannot be a tagRecord: ${tagRecord}`)) &&
      checkNormalProperty(tagRecord, PASS_STYLE, false, check) &&
      checkPassStyle(tagRecord, passStyle, check) &&
      checkNormalProperty(tagRecord, Symbol.toStringTag, false, check) &&
      (typeof getTag(tagRecord) === 'string' ||
        (!!check &&
          CX(
            check,
          )`A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`)) &&
      checkProto(tagRecord, getPrototypeOf(tagRecord), check)
    );
  };
  return harden(checkTagRecord);
};

export const checkTagRecord = makeCheckTagRecord(
  (val, proto, check) =>
    proto === objectPrototype ||
    (!!check &&
      check(false, X`A tagRecord must inherit from Object.prototype: ${val}`)),
);
harden(checkTagRecord);

export const checkFunctionTagRecord = makeCheckTagRecord(
  (val, proto, check) =>
    proto === functionPrototype ||
    (proto !== null && getPrototypeOf(proto) === functionPrototype) ||
    (!!check &&
      check(
        false,
        X`For functions, a tagRecord must inherit from Function.prototype: ${val}`,
      )),
);
harden(checkFunctionTagRecord);
