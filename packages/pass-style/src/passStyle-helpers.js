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
  prototype: objectPrototype,
  isFrozen,

  // The following is commented out due to
  // https://github.com/endojs/endo/issues/2094
  // TODO Once fixed, comment this back in and remove the workaround
  // immediately below.
  //
  // // https://github.com/endojs/endo/pull/2673
  // // @ts-expect-error TS does not yet have this on ObjectConstructor.
  // isNonTrapping = isFrozen,
} = Object;

// workaround for https://github.com/endojs/endo/issues/2094
// See commented out code and note immediately above.
// @ts-expect-error TS does not yet have this on ObjectConstructor.
export const isNonTrapping = Object.isNonTrapping || isFrozen;

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
 * Verifies the presence and enumerability of an own data property
 * and returns its descriptor.
 *
 * @param {object} candidate
 * @param {string|number|symbol} propName
 * @param {boolean} shouldBeEnumerable
 * @param {Checker} [check]
 * @returns {PropertyDescriptor}
 */
export const getOwnDataDescriptor = (
  candidate,
  propName,
  shouldBeEnumerable,
  check,
) => {
  const desc = /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(candidate, propName)
  );
  return (desc !== undefined ||
    (!!check && CX(check)`${q(propName)} property expected: ${candidate}`)) &&
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
          CX(
            check,
          )`${q(propName)} must not be an enumerable property: ${candidate}`))
    ? desc
    : /** @type {PropertyDescriptor} */ (/** @type {unknown} */ (undefined));
};
harden(getOwnDataDescriptor);

/**
 * @template {import('./types.js').InterfaceSpec} T
 * @param {import('./types.js').PassStyled<any, T>} tagRecord
 * @returns {T}
 */
export const getTag = tagRecord => tagRecord[Symbol.toStringTag];
harden(getTag);

export const checkPassStyle = (obj, passStyle, expectedPassStyle, check) => {
  return (
    passStyle === expectedPassStyle ||
    (!!check &&
      CX(check)`Expected ${q(expectedPassStyle)}, not ${q(passStyle)}: ${obj}`)
  );
};
harden(checkPassStyle);

const makeCheckTagRecord = checkProto => {
  /**
   * @param {import('./types.js').PassStyled<any, any>} tagRecord
   * @param {PassStyle} expectedPassStyle
   * @param {Checker} [check]
   * @returns {boolean}
   */
  const checkTagRecord = (tagRecord, expectedPassStyle, check) => {
    return (
      (isObject(tagRecord) ||
        (!!check &&
          CX(check)`A non-object cannot be a tagRecord: ${tagRecord}`)) &&
      (isFrozen(tagRecord) ||
        (!!check && CX(check)`A tagRecord must be frozen: ${tagRecord}`)) &&
      (isNonTrapping(tagRecord) ||
        (!!check &&
          CX(check)`A tagRecord must be non-trapping: ${tagRecord}`)) &&
      (!isArray(tagRecord) ||
        (!!check && CX(check)`An array cannot be a tagRecord: ${tagRecord}`)) &&
      checkPassStyle(
        tagRecord,
        getOwnDataDescriptor(tagRecord, PASS_STYLE, false, check).value,
        expectedPassStyle,
        check,
      ) &&
      (typeof getOwnDataDescriptor(tagRecord, Symbol.toStringTag, false, check)
        .value === 'string' ||
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
