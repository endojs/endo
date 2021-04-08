// @ts-check

// eslint-disable-next-line spaced-comment
/// <reference types="ses"/>

import { assert, details as X, q } from '@agoric/assert';
import { isPromise } from '@agoric/promise-kit';

import './types';

const {
  getPrototypeOf,
  getOwnPropertyDescriptors,
  isFrozen,
  prototype: objectPrototype,
} = Object;

const { ownKeys } = Reflect;

// TODO: Use just 'remote' when we're willing to make a breaking change.
export const REMOTE_STYLE = 'presence';

export const PASS_STYLE = Symbol.for('passStyle');

/** @type {MarshalGetInterfaceOf} */
export function getInterfaceOf(val) {
  if (typeof val !== 'object' || val === null) {
    return undefined;
  }
  if (val[PASS_STYLE] !== REMOTE_STYLE) {
    return undefined;
  }
  assert(isFrozen(val), X`Remotable ${val} must be frozen`, TypeError);
  const iface = val[Symbol.toStringTag];
  assert.typeof(
    iface,
    'string',
    X`Remotable interface currently can only be a string`,
  );
  return iface;
}

const errorConstructors = new Map([
  ['Error', Error],
  ['EvalError', EvalError],
  ['RangeError', RangeError],
  ['ReferenceError', ReferenceError],
  ['SyntaxError', SyntaxError],
  ['TypeError', TypeError],
  ['URIError', URIError],
]);

export function getErrorConstructor(name) {
  return errorConstructors.get(name);
}

/**
 * For most of these classification tests, we do strict validity `assert`s,
 * throwing if we detect something invalid. For errors, we need to remember
 * the error itself exists to help us diagnose a bug that's likely more
 * pressing than a validity bug in the error itself. Thus, whenever it is safe
 * to do so, we prefer to let the error test succeed and to couch these
 * complaints as notes on the error.
 *
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyError(val) {
  // TODO: Need a better test than instanceof
  if (!(val instanceof Error)) {
    return false;
  }
  const proto = getPrototypeOf(val);
  const { name } = val;
  const EC = getErrorConstructor(name);
  if (!EC || EC.prototype !== proto) {
    assert.note(
      val,
      X`Errors must inherit from an error class .prototype ${val}`,
    );
  }

  const {
    message: mDesc,
    // Allow but ignore only extraneous own `stack` property.
    stack: _optStackDesc,
    ...restDescs
  } = getOwnPropertyDescriptors(val);
  if (ownKeys(restDescs).length >= 1) {
    assert.note(
      val,
      X`Passed Error has extra unpassed properties ${restDescs}`,
    );
  }
  if (mDesc) {
    if (typeof mDesc.value !== 'string') {
      assert.note(
        val,
        X`Passed Error "message" ${mDesc} must be a string-valued data property.`,
      );
    }
    if (mDesc.enumerable) {
      assert.note(
        val,
        X`Passed Error "message" ${mDesc} must not be enumerable`,
      );
    }
  }
  return true;
}

/**
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyArray(val) {
  if (!Array.isArray(val)) {
    return false;
  }
  assert(
    getPrototypeOf(val) === Array.prototype,
    X`Malformed array: ${val}`,
    TypeError,
  );
  const len = val.length;
  const descs = getOwnPropertyDescriptors(val);
  for (let i = 0; i < len; i += 1) {
    const desc = descs[i];
    assert(desc, X`Arrays must not contain holes: ${q(i)}`, TypeError);
    assert(
      'value' in desc,
      X`Arrays must not contain accessors: ${q(i)}`,
      TypeError,
    );
    assert(
      typeof desc.value !== 'function',
      X`Arrays must not contain methods: ${q(i)}`,
      TypeError,
    );
    assert(
      desc.enumerable,
      X`Array elements must be enumerable: ${q(i)}`,
      TypeError,
    );
  }
  assert(
    ownKeys(descs).length === len + 1,
    X`Arrays must not have non-indexes: ${val}`,
    TypeError,
  );
  return true;
}

/**
 * @param {Passable} val
 * @returns {boolean}
 */
function isPassByCopyRecord(val) {
  const proto = getPrototypeOf(val);
  if (proto !== objectPrototype) {
    return false;
  }
  const descs = getOwnPropertyDescriptors(val);
  const descKeys = ownKeys(descs);

  for (const descKey of descKeys) {
    if (typeof descKey === 'symbol') {
      return false;
    }
    const desc = descs[descKey];
    if (typeof desc.value === 'function') {
      return false;
    }
  }
  for (const descKey of descKeys) {
    assert.typeof(
      descKey,
      'string',
      X`Pass by copy records can only have string-named own properties`,
    );
    const desc = descs[descKey];
    assert(
      !('get' in desc),
      X`Records must not contain accessors: ${q(descKey)}`,
      TypeError,
    );
    assert(
      desc.enumerable,
      X`Record fields must be enumerable: ${q(descKey)}`,
      TypeError,
    );
  }
  return true;
}

/**
 * Throw if val is not the correct shape for the prototype of a Remotable.
 *
 * TODO: It would be nice to typedef this shape and then declare that this
 * function asserts it, but we can't declare a type with PASS_STYLE from JSDoc.
 *
 * @param {{ [PASS_STYLE]: string, [Symbol.toStringTag]: string, toString: () =>
 * void}} val the value to verify
 */
const assertRemotableProto = val => {
  assert.typeof(val, 'object', X`cannot serialize non-objects like ${val}`);
  assert(!Array.isArray(val), X`Arrays cannot be pass-by-remote`);
  assert(val !== null, X`null cannot be pass-by-remote`);

  const protoProto = getPrototypeOf(val);
  assert(
    protoProto === objectPrototype || protoProto === null,
    X`The Remotable Proto marker cannot inherit from anything unusual`,
  );
  assert(isFrozen(val), X`The Remotable proto must be frozen`);
  const {
    [PASS_STYLE]: { value: passStyleValue },
    toString: { value: toStringValue },
    // @ts-ignore https://github.com/microsoft/TypeScript/issues/1863
    [Symbol.toStringTag]: { value: toStringTagValue },
    ...rest
  } = getOwnPropertyDescriptors(val);
  assert(
    ownKeys(rest).length === 0,
    X`Unexpect properties on Remotable Proto ${ownKeys(rest)}`,
  );
  assert(
    passStyleValue === REMOTE_STYLE,
    X`Expected ${q(REMOTE_STYLE)}, not ${q(passStyleValue)}`,
  );
  assert.typeof(toStringValue, 'function', X`toString must be a function`);
  assert.typeof(toStringTagValue, 'string', X`@@toStringTag must be a string`);
};

/**
 * Ensure that val could become a legitimate remotable.  This is used
 * internally both in the construction of a new remotable and
 * mustPassByRemote.
 *
 * @param {*} val The remotable candidate to check
 */
export function assertCanBeRemotable(val) {
  // throws exception if cannot
  assert.typeof(val, 'object', X`cannot serialize non-objects like ${val}`);
  assert(!Array.isArray(val), X`Arrays cannot be pass-by-remote`);
  assert(val !== null, X`null cannot be pass-by-remote`);

  const descs = getOwnPropertyDescriptors(val);
  const keys = ownKeys(descs); // enumerable-and-not, string-or-Symbol
  keys.forEach(key => {
    assert(
      // Typecast needed due to https://github.com/microsoft/TypeScript/issues/1863
      !('get' in descs[/** @type {string} */ (key)]),
      X`cannot serialize objects with getters like ${q(String(key))} in ${val}`,
    );
    assert.typeof(
      // @ts-ignore https://github.com/microsoft/TypeScript/issues/1863
      val[key],
      'function',
      X`cannot serialize objects with non-methods like ${q(
        String(key),
      )} in ${val}`,
    );
    assert(
      key !== PASS_STYLE,
      X`A pass-by-remote cannot shadow ${q(PASS_STYLE)}`,
    );
  });
}

/**
 * @param {Remotable} val
 */
function assertRemotable(val) {
  assert(isFrozen(val), X`cannot serialize non-frozen objects like ${val}`);

  assertCanBeRemotable(val);

  const p = getPrototypeOf(val);
  if (p !== null && p !== objectPrototype) {
    assertRemotableProto(p);
  }
}

/**
 * objects can only be passed in one of two/three forms:
 * 1: pass-by-remote: all properties (own and inherited) are methods,
 *    the object itself is of type object, not function
 * 2: pass-by-copy: all string-named own properties are data, not methods
 *    the object must inherit from objectPrototype or null
 * 3: the empty object is pass-by-remote, for identity comparison
 *
 * all objects must be frozen
 *
 * anything else will throw an error if you try to serialize it
 * with these restrictions, our remote call/copy protocols expose all useful
 * behavior of these objects: pass-by-remote objects have no other data (so
 * there's nothing else to copy), and pass-by-copy objects have no other
 * behavior (so there's nothing else to invoke)
 *
 * How would val be passed?  For primitive values, the answer is
 *   * 'null' for null
 *   * throwing an error for a symbol, whether registered or not.
 *   * that value's typeof string for all other primitive values
 * For frozen objects, the possible answers
 *   * 'copyRecord' for non-empty records with only data properties
 *   * 'copyArray' for arrays with only data properties
 *   * 'copyError' for instances of Error with only data properties
 *   * REMOTE_STYLE for non-array objects with only method properties
 *   * 'promise' for genuine promises only
 *   * throwing an error on anything else, including thenables.
 * We export passStyleOf so other algorithms can use this module's
 * classification.
 *
 * @param {Passable} val
 * @returns {PassStyle}
 */
export function passStyleOf(val) {
  const typestr = typeof val;
  switch (typestr) {
    case 'object': {
      if (getInterfaceOf(val)) {
        return REMOTE_STYLE;
      }
      if (val === null) {
        return 'null';
      }
      assert(
        isFrozen(val),
        X`Cannot pass non-frozen objects like ${val}. Use harden()`,
      );
      if (isPromise(val)) {
        return 'promise';
      }
      assert(
        typeof val.then !== 'function',
        X`Cannot pass non-promise thenables`,
      );
      if (isPassByCopyError(val)) {
        return 'copyError';
      }
      if (isPassByCopyArray(val)) {
        return 'copyArray';
      }
      if (isPassByCopyRecord(val)) {
        return 'copyRecord';
      }
      assertRemotable(val);
      // console.log(`--- @@marshal: pass-by-ref object without Far/Remotable`);
      // assert.fail(X`pass-by-ref object without Far/Remotable`);
      return REMOTE_STYLE;
    }
    case 'function': {
      assert.fail(X`Bare functions like ${val} are disabled for now`);
    }
    case 'undefined':
    case 'string':
    case 'boolean':
    case 'number':
    case 'bigint':
    case 'symbol': {
      return typestr;
    }
    default: {
      assert.fail(X`Unrecognized typeof ${q(typestr)}`, TypeError);
    }
  }
}
