/// <reference types="ses"/>

import { X, q } from '@endo/errors';

/**
 * @import {Checker} from '@endo/common/ident-checker.js';
 * @import {JSPrimitive, PassStyle} from './types.js';
 */

const { isArray } = Array;
const { prototype: functionPrototype } = Function;
const {
  getOwnPropertyDescriptor,
  getPrototypeOf,
  hasOwn,
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

/**
 * @deprecated Use `Object.hasOwn` instead
 */
export const hasOwnPropertyOf = hasOwn;

/**
 * @type {(val: unknown) => val is JSPrimitive}
 */
export const isPrimitive = val =>
  // Safer would be `Object(val) !== val` but is too expensive on XS.
  // So instead we use this adhoc set of type tests. But this is not safe in
  // the face of possible evolution of the language. Beware!
  !val || (typeof val !== 'object' && typeof val !== 'function');
harden(isPrimitive);

// NOTE: Do not make this type more precise because it breaks only clients
// that rely on it being less precise.
/**
 * @deprecated use `!isPrimitive` instead
 * @param {any} val
 * @returns {boolean}
 */
export const isObject = val =>
  // Safer would be `Object(val) -== val` but is too expensive on XS.
  // So instead we use this adhoc set of type tests. But this is not safe in
  // the face of possible evolution of the language. Beware!
  !!val && (typeof val === 'object' || typeof val === 'function');
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
    (hasOwn(desc, 'value') ||
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
      (!isPrimitive(tagRecord) ||
        (!!check &&
          CX(check)`A non-object cannot be a tagRecord: ${tagRecord}`)) &&
      (isFrozen(tagRecord) ||
        (!!check && CX(check)`A tagRecord must be frozen: ${tagRecord}`)) &&
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
