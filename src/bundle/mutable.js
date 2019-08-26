// Adapted from SES/Caja
// Copyright (C) 2011 Google Inc.
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/startSES.js
// https://github.com/google/caja/blob/master/src/com/google/caja/ses/repairES5.js

import {
  defineProperties,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  ownKeys,
  objectHasOwnProperty
} from '../../realms-shim/src/commons';


/**
 * For a special set of properties (defined below), it ensures that the
 * effect of freezing does not suppress the ability to override these
 * properties on derived objects by simple assignment.
 *
 * Because of lack of sufficient foresight at the time, ES5 unfortunately
 * specified that a simple assignment to a non-existent property must fail if
 * it would override a non-writable data property of the same name. (In
 * retrospect, this was a mistake, but it is now too late and we must live
 * with the consequences.) As a result, simply freezing an object to make it
 * tamper proof has the unfortunate side effect of breaking previously correct
 * code that is considered to have followed JS best practices, if this
 * previous code used assignment to override.
 *
 * To work around this mistake, deepFreeze(), prior to freezing, replaces
 * selected configurable own data properties with accessor properties which
 * simulate what we should have specified -- that assignments to derived
 * objects succeed if otherwise possible.
 */
function beMutable(obj, prop, desc) {
  if ('value' in desc && desc.configurable) {
    const value = desc.value;

    // eslint-disable-next-line no-inner-declarations
    function getter() {
      return value;
    }

    // Re-attach the data property on the object so
    // it can be found by the deep-freeze traversal process.
    getter.value = value;

    // eslint-disable-next-line no-inner-declarations
    function setter(newValue) {
      if (obj === this) {
        throw new TypeError(`Cannot assign to read only property '${prop}' of object '${obj}'`);
      }
      if (objectHasOwnProperty.call(this, prop)) {
        this[prop] = newValue;
      } else {
        defineProperty(this, prop, {
          value: newValue,
          writable: true,
          enumerable: desc.enumerable,
          configurable: desc.configurable
        });
      }
    }

    defineProperty(obj, prop, {
      get: getter,
      set: setter,
      enumerable: desc.enumerable,
      configurable: desc.configurable
    });
  }
}

export function beMutableProperties(obj) {
  if (!obj) {
    return;
  }
  const descs = getOwnPropertyDescriptors(obj);
  if (!descs) {
    return;
  }
  ownKeys(obj).forEach(prop => beMutable(obj, prop, descs[prop]));
}

export function beMutableProperty(obj, prop) {
  const desc = getOwnPropertyDescriptor(obj, prop);
  beMutable(obj, prop, desc);
}

/**
 * These properties are subject to the override mistake
 * and must be converted before freezing.
 */
export function repairDataProperties(intrinsics) {
  const { global: g, anonIntrinsics: a } = intrinsics;

  [
    g.Object.prototype,
    g.Array.prototype,
    g.Boolean.prototype,
    g.Date.prototype,
    g.Number.prototype,
    g.String.prototype,

    g.Function.prototype,
    a.GeneratorFunction.prototype,
    a.AsyncFunction.prototype,
    a.AsyncGeneratorFunction.prototype,

    a.IteratorPrototype,
    a.ArrayIteratorPrototype,

    g.Promise.prototype,
    g.DataView.prototype,

    a.TypedArray,
    g.Int8Array.prototype,
    g.Int16Array.prototype,
    g.Int32Array.prototype,
    g.Uint8Array,
    g.Uint16Array,
    g.Uint32Array,

    g.Error.prototype,
    g.EvalError.prototype,
    g.RangeError.prototype,
    g.ReferenceError.prototype,
    g.SyntaxError.prototype,
    g.TypeError.prototype,
    g.URIError.prototype
  ].forEach(beMutableProperties);
}

// Object.defineProperty is allowed to fail silently,
// wrap Object.defineProperties instead.
function defineProperty (obj, prop, desc) {
  defineProperties(obj, { [prop]: desc });
}