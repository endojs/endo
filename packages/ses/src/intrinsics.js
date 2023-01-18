import {
  TypeError,
  WeakSet,
  arrayFilter,
  defineProperty,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  globalThis,
  is,
  isObject,
  objectHasOwnProperty,
  values,
  weaksetHas,
} from './commons.js';

import {
  constantProperties,
  sharedGlobalPropertyNames,
  universalPropertyNames,
  whitelist,
} from './whitelist.js';

const isFunction = obj => typeof obj === 'function';

// Like defineProperty, but throws if it would modify an existing property.
// We use this to ensure that two conflicting attempts to define the same
// property throws, causing SES initialization to fail. Otherwise, a
// conflict between, for example, two of SES's internal whitelists might
// get masked as one overwrites the other. Accordingly, the thrown error
// complains of a "Conflicting definition".
function initProperty(obj, name, desc) {
  if (objectHasOwnProperty(obj, name)) {
    const preDesc = getOwnPropertyDescriptor(obj, name);
    if (
      !is(preDesc.value, desc.value) ||
      preDesc.get !== desc.get ||
      preDesc.set !== desc.set ||
      preDesc.writable !== desc.writable ||
      preDesc.enumerable !== desc.enumerable ||
      preDesc.configurable !== desc.configurable
    ) {
      throw new TypeError(`Conflicting definitions of ${name}`);
    }
  }
  defineProperty(obj, name, desc);
}

// Like defineProperties, but throws if it would modify an existing property.
// This ensures that the intrinsics added to the intrinsics collector object
// graph do not overlap.
function initProperties(obj, descs) {
  for (const [name, desc] of entries(descs)) {
    initProperty(obj, name, desc);
  }
}

// sampleGlobals creates an intrinsics object, suitable for
// interinsicsCollector.addIntrinsics, from the named properties of a global
// object.
function sampleGlobals(globalObject, newPropertyNames) {
  const newIntrinsics = { __proto__: null };
  for (const [globalName, intrinsicName] of entries(newPropertyNames)) {
    if (objectHasOwnProperty(globalObject, globalName)) {
      newIntrinsics[intrinsicName] = globalObject[globalName];
    }
  }
  return newIntrinsics;
}

export const makeIntrinsicsCollector = () => {
  const intrinsics = { __proto__: null };
  let pseudoNatives;

  const addIntrinsics = newIntrinsics => {
    initProperties(intrinsics, getOwnPropertyDescriptors(newIntrinsics));
  };
  freeze(addIntrinsics);

  // For each intrinsic, if it has a `.prototype` property, use the
  // whitelist to find out the intrinsic name for that prototype and add it
  // to the intrinsics.
  const completePrototypes = () => {
    for (const [name, intrinsic] of entries(intrinsics)) {
      if (!isObject(intrinsic)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (!objectHasOwnProperty(intrinsic, 'prototype')) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const permit = whitelist[name];
      if (typeof permit !== 'object') {
        throw new TypeError(`Expected permit object at whitelist.${name}`);
      }
      const namePrototype = permit.prototype;
      if (!namePrototype) {
        throw new TypeError(`${name}.prototype property not whitelisted`);
      }
      if (
        typeof namePrototype !== 'string' ||
        !objectHasOwnProperty(whitelist, namePrototype)
      ) {
        throw new TypeError(`Unrecognized ${name}.prototype whitelist entry`);
      }
      const intrinsicPrototype = intrinsic.prototype;
      if (objectHasOwnProperty(intrinsics, namePrototype)) {
        if (intrinsics[namePrototype] !== intrinsicPrototype) {
          throw new TypeError(`Conflicting bindings of ${namePrototype}`);
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      intrinsics[namePrototype] = intrinsicPrototype;
    }
  };
  freeze(completePrototypes);

  const finalIntrinsics = () => {
    freeze(intrinsics);
    pseudoNatives = new WeakSet(arrayFilter(values(intrinsics), isFunction));
    return intrinsics;
  };
  freeze(finalIntrinsics);

  const isPseudoNative = obj => {
    if (!pseudoNatives) {
      throw new TypeError(
        'isPseudoNative can only be called after finalIntrinsics',
      );
    }
    return weaksetHas(pseudoNatives, obj);
  };
  freeze(isPseudoNative);

  const intrinsicsCollector = {
    addIntrinsics,
    completePrototypes,
    finalIntrinsics,
    isPseudoNative,
  };
  freeze(intrinsicsCollector);

  addIntrinsics(constantProperties);
  addIntrinsics(sampleGlobals(globalThis, universalPropertyNames));

  return intrinsicsCollector;
};

/**
 * getGlobalIntrinsics()
 * Doesn't tame, delete, or modify anything. Samples globalObject to create an
 * intrinsics record containing only the whitelisted global variables, listed
 * by the intrinsic names appropriate for new globals, i.e., the globals of
 * newly constructed compartments.
 *
 * WARNING:
 * If run before lockdown, the returned intrinsics record will carry the
 * *original* unsafe (feral, untamed) bindings of these global variables.
 *
 * @param {object} globalObject
 */
export const getGlobalIntrinsics = globalObject => {
  const { addIntrinsics, finalIntrinsics } = makeIntrinsicsCollector();

  addIntrinsics(sampleGlobals(globalObject, sharedGlobalPropertyNames));

  return finalIntrinsics();
};
