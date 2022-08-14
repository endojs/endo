// @ts-check

/// <reference types="ses"/>

/** @typedef {import('../types.js').Checker} Checker */
/** @typedef {import('../types.js').PassStyle} PassStyle */

const { details: X, quote: q } = assert;
const {
  getOwnPropertyDescriptor,
  hasOwnProperty: objectHasOwnProperty,
  isFrozen,
} = Object;
const { apply } = Reflect;
const { isArray } = Array;

export const hasOwnPropertyOf = (obj, prop) =>
  apply(objectHasOwnProperty, obj, [prop]);
harden(hasOwnPropertyOf);

export const isObject = val => Object(val) === val;
harden(isObject);

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
 * @param {Object} candidate
 * @param {string|number|symbol} propertyName
 * @param {string=} nameType
 * @param {boolean=} shouldBeEnumerable
 * @param {Checker=} check
 * @returns {boolean}
 */
export const checkNormalProperty = (
  candidate,
  propertyName,
  nameType = undefined,
  shouldBeEnumerable = true,
  check = x => x,
) => {
  const desc = getOwnPropertyDescriptor(candidate, propertyName);
  if (desc === undefined) {
    return check(false, X`${q(propertyName)} property expected: ${candidate}`);
  }
  return (
    check(
      // eslint-disable-next-line valid-typeof
      nameType === undefined || typeof propertyName === nameType,
      X`${q(propertyName)} must be a ${q(
        nameType,
      )}-named property: ${candidate}`,
    ) &&
    check(
      hasOwnPropertyOf(desc, 'value'),
      X`${q(propertyName)} must not be an accessor property: ${candidate}`,
    ) &&
    (shouldBeEnumerable
      ? check(
          !!desc.enumerable,
          X`${q(propertyName)} must be an enumerable property: ${candidate}`,
        )
      : check(
          !desc.enumerable,
          X`${q(
            propertyName,
          )} must not be an enumerable property: ${candidate}`,
        ))
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
export const checkTagRecord = (tagRecord, passStyle, check = x => x) => {
  return (
    check(isFrozen(tagRecord), X`A tagRecord must be frozen: ${tagRecord}`) &&
    check(
      typeof tagRecord === 'object',
      X`A non-object cannot be a tagRecord: ${tagRecord}`,
    ) &&
    check(
      !isArray(tagRecord),
      X`An array cannot be a tagRecords: ${tagRecord}`,
    ) &&
    check(tagRecord !== null, X`null cannot be a tagRecord`) &&
    checkNormalProperty(tagRecord, PASS_STYLE, 'symbol', false, check) &&
    check(
      tagRecord[PASS_STYLE] === passStyle,
      X`Expected ${q(passStyle)}, not ${q(
        tagRecord[PASS_STYLE],
      )}: ${tagRecord}`,
    ) &&
    checkNormalProperty(
      tagRecord,
      Symbol.toStringTag,
      'symbol',
      false,
      check,
    ) &&
    check(
      typeof getTag(tagRecord) === 'string',
      X`A [Symbol.toString]-named property must be a string: ${tagRecord}`,
    )
  );
};
harden(checkTagRecord);
