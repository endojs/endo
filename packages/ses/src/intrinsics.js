import {
  AsyncGeneratorFunctionInstance,
  TypeError,
  WeakSet,
  arrayFilter,
  create,
  defineProperty,
  entries,
  freeze,
  getOwnPropertyDescriptor,
  getOwnPropertyDescriptors,
  globalThis,
  is,
  isObject,
  keys,
  objectHasOwnProperty,
  printHermes,
  stringifyJson,
  values,
  weaksetHas,
} from './commons.js';

import {
  constantProperties,
  sharedGlobalPropertyNames,
  universalPropertyNames,
  permitted,
} from './permits.js';

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
      !preDesc ||
      !is(preDesc.value, desc.value) ||
      preDesc.get !== desc.get ||
      preDesc.set !== desc.set ||
      preDesc.writable !== desc.writable ||
      preDesc.enumerable !== desc.enumerable ||
      preDesc.configurable !== desc.configurable
    ) {
      throw TypeError(`Conflicting definitions of ${name}`);
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
  /** @type {Record<any, any>} */
  const intrinsics = create(null);
  let pseudoNatives;

  const addIntrinsics = newIntrinsics => {
    initProperties(intrinsics, getOwnPropertyDescriptors(newIntrinsics));
  };
  freeze(addIntrinsics);

  // For each intrinsic, if it has a `.prototype` property, use the
  // whitelist to find out the intrinsic name for that prototype and add it
  // to the intrinsics.
  const completePrototypes = () => {
    printHermes('SES: completePrototypes');
    printHermes(`+ 13 enumerable intrinsics: ${stringifyJson(intrinsics)}`); // 13 enumerable intrinsics
    printHermes(`+ 71 Intrinsics: ${keys(intrinsics)}`); // 71 intrinsics
    let i = 0;
    for (const [name, intrinsic] of entries(intrinsics)) {
      i += 1;
      if (AsyncGeneratorFunctionInstance === undefined) {
        printHermes(
          `- ${i} ${name} : ${name !== '%Generator%' ? intrinsic : "❌ Uncaught TypeError: Can't call Function.prototype.toString() on non-callable"}`,
        );
      }
      name === 'Promise' &&
        printHermes(
          `-- ${stringifyJson(getOwnPropertyDescriptors(intrinsic))}`,
        );
      if (!isObject(intrinsic)) {
        // eslint-disable-next-line no-continue
        continue;
      }
      if (
        !objectHasOwnProperty(intrinsic, 'prototype')
        // || (typeof intrinsicPrototype === 'object' &&
        // eslint-disable-next-line
        // Object.keys(intrinsicPrototype).length === 0)
        // However this condition does too much, it breaks the build when whitelistIntrinsics is called after
        // SES_UNCAUGHT_EXCEPTION: (TypeError#1) Unexpected property prototype with permit %ArrayPrototype% at intrinsics.Array.prototype
      ) {
        // eslint-disable-next-line no-continue
        continue;
      }
      const permit = permitted[name];
      if (typeof permit !== 'object') {
        throw TypeError(`Expected permit object at whitelist.${name}`);
      }
      const permitPrototype = permit.prototype;

      if (
        typeof intrinsic === 'function' &&
        intrinsic.prototype !== undefined &&
        permitPrototype === 'undefined' // permits.js
      ) {
        try {
          intrinsic.prototype = undefined;
          printHermes(
            `Setting prototype to undefined on ${intrinsic} on name ${name}`,
          );
        } catch {
          printHermes(`❌ Not setting prototype to undefined on ${name}`);
        }
      }

      const intrinsicPrototype = intrinsic.prototype;

      if (!permitPrototype) {
        printHermes(
          `-- ${stringifyJson(getOwnPropertyDescriptors(intrinsic))}`,
        );
        throw TypeError(`${name}.prototype property not whitelisted`);
      }
      if (
        typeof permitPrototype !== 'string' ||
        !objectHasOwnProperty(permitted, permitPrototype)
      ) {
        throw TypeError(`Unrecognized ${name}.prototype whitelist entry`);
      }
      if (objectHasOwnProperty(intrinsics, permitPrototype)) {
        if (intrinsics[permitPrototype] !== intrinsicPrototype) {
          throw TypeError(`Conflicting bindings of ${permitPrototype}`);
        }
        // eslint-disable-next-line no-continue
        continue;
      }
      intrinsics[permitPrototype] = intrinsicPrototype;
    }
    // printHermes(`- ${stringifyJson(intrinsics)}`); // [TypeError: this is not a Date object.]
    printHermes(`+ 110 Intrinsics: ${keys(intrinsics)}`); // 110 intrinsics
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
      throw TypeError(
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
