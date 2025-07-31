/// <reference types="ses"/>

import { X, q } from '@endo/errors';

/**
 * @import {Rejector} from '@endo/common/rejector.js';
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
 * Verifies the presence and enumerability of an own data property
 * and returns its descriptor.
 *
 * @param {object} candidate
 * @param {string|number|symbol} propName
 * @param {boolean} shouldBeEnumerable
 * @param {Rejector} reject
 * @returns {PropertyDescriptor}
 */
export const confirmOwnDataDescriptor = (
  candidate,
  propName,
  shouldBeEnumerable,
  reject,
) => {
  const desc = /** @type {PropertyDescriptor} */ (
    getOwnPropertyDescriptor(candidate, propName)
  );
  return (desc !== undefined ||
    (reject && reject`${q(propName)} property expected: ${candidate}`)) &&
    (hasOwn(desc, 'value') ||
      (reject &&
        reject`${q(propName)} must not be an accessor property: ${candidate}`)) &&
    (shouldBeEnumerable
      ? desc.enumerable ||
        (reject &&
          reject`${q(propName)} must be an enumerable property: ${candidate}`)
      : !desc.enumerable ||
        (reject &&
          reject`${q(propName)} must not be an enumerable property: ${candidate}`))
    ? desc
    : /** @type {PropertyDescriptor} */ (/** @type {unknown} */ (undefined));
};
harden(confirmOwnDataDescriptor);

/**
 * @template {import('./types.js').InterfaceSpec} T
 * @param {import('./types.js').PassStyled<any, T>} tagRecord
 * @returns {T}
 */
export const getTag = tagRecord => tagRecord[Symbol.toStringTag];
harden(getTag);

export const checkPassStyle = (obj, passStyle, expectedPassStyle, reject) => {
  return (
    passStyle === expectedPassStyle ||
    (reject &&
      reject`Expected ${q(expectedPassStyle)}, not ${q(passStyle)}: ${obj}`)
  );
};
harden(checkPassStyle);

const makeCheckTagRecord = checkProto => {
  /**
   * @param {import('./types.js').PassStyled<any, any>} tagRecord
   * @param {PassStyle} expectedPassStyle
   * @param {Rejector} reject
   * @returns {boolean}
   */
  const checkTagRecord = (tagRecord, expectedPassStyle, reject) => {
    return (
      (!isPrimitive(tagRecord) ||
        (reject && reject`A non-object cannot be a tagRecord: ${tagRecord}`)) &&
      (isFrozen(tagRecord) ||
        (reject && reject`A tagRecord must be frozen: ${tagRecord}`)) &&
      (!isArray(tagRecord) ||
        (reject && reject`An array cannot be a tagRecord: ${tagRecord}`)) &&
      checkPassStyle(
        tagRecord,
        confirmOwnDataDescriptor(tagRecord, PASS_STYLE, false, reject).value,
        expectedPassStyle,
        reject,
      ) &&
      (typeof confirmOwnDataDescriptor(
        tagRecord,
        Symbol.toStringTag,
        false,
        reject,
      ).value === 'string' ||
        (reject &&
          reject`A [Symbol.toStringTag]-named property must be a string: ${tagRecord}`)) &&
      checkProto(tagRecord, getPrototypeOf(tagRecord), reject)
    );
  };
  return harden(checkTagRecord);
};

export const checkTagRecord = makeCheckTagRecord(
  (val, proto, check) =>
    proto === objectPrototype ||
    (!!check && check`A tagRecord must inherit from Object.prototype: ${val}`),
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
