/* global globalThis */

import '../index.js';
import './_lockdown-safe.js';
import test from 'ava';
import {
  setGlobalObjectConstantProperties,
  setGlobalObjectMutableProperties,
  setGlobalObjectEvaluators,
} from '../src/global-object.js';
import { sharedGlobalPropertyNames } from '../src/permits.js';
import { makeCompartmentConstructor } from '../src/compartment.js';

test('globalObject', t => {
  const intrinsics = {
    Date: globalThis.Date,
    // eslint-disable-next-line no-eval
    eval: globalThis.eval,
    Function: globalThis.Function,
    globalThis: {},
  };

  const globalObject = {};
  setGlobalObjectConstantProperties(globalObject);
  const safeEvaluate = (_source, _options) => {};
  const markVirtualizedNativeFunction = _ => {};
  setGlobalObjectMutableProperties(globalObject, {
    intrinsics,
    newGlobalPropertyNames: sharedGlobalPropertyNames,
    makeCompartmentConstructor,
    markVirtualizedNativeFunction,
  });
  setGlobalObjectEvaluators(
    globalObject,
    safeEvaluate,
    markVirtualizedNativeFunction,
  );

  t.true(globalObject instanceof Object);
  t.is(Object.getPrototypeOf(globalObject), Object.prototype);
  t.true(!Object.isFrozen(globalObject) || harden.isFake);
  t.not(globalObject, globalThis);
  t.is(globalObject.globalThis, globalObject);

  t.is(Object.getOwnPropertyNames(globalObject).length, 7);

  const descs = Object.getOwnPropertyDescriptors(globalObject);
  for (const [name, desc] of Object.entries(descs)) {
    if (name === 'Infinity') {
      // eslint-disable-next-line no-restricted-globals
      t.true(!isFinite(desc.value), `${name} should be Infinity`);
    } else if (name === 'NaN') {
      // eslint-disable-next-line no-restricted-globals
      t.true(isNaN(desc.value), `${name} should be NaN`);
    } else if (name === 'undefined') {
      t.is(desc.value, undefined, `${name} should be undefined`);
    } else if (['eval', 'Function', 'globalThis'].includes(name)) {
      t.not(
        desc.value,
        intrinsics[name],
        `${name} should not be the intrinsics ${name}`,
      );
      t.not(
        desc.value,
        globalThis[name],
        `${name} should not be the global ${name}`,
      );
    }

    if (['Infinity', 'NaN', 'undefined'].includes(name)) {
      t.false(desc.configurable, `${name} should not be configurable`);
      t.false(desc.writable, `${name} should not be writable`);
      t.false(desc.enumerable, `${name} should not be enumerable`);
    } else {
      t.true(desc.configurable, `${name} should be configurable`);
      t.true(desc.writable, `${name} should be writable`);
      t.false(desc.enumerable, `${name} should not be enumerable`);
    }
  }
});
