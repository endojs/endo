import tap from 'tap';
import sinon from 'sinon';
import { initGlobalObject } from '../src/global-object.js';
import stubFunctionConstructors from './stub-function-constructors.js';
import { sharedGlobalPropertyNames } from '../src/whitelist.js';

const { test } = tap;

test('globalObject', t => {
  // Mimic repairFunctions.
  stubFunctionConstructors(sinon);

  const intrinsics = {
    Date: globalThis.Date,
    eval: globalThis.eval,
    Function: globalThis.Function,
    globalThis: {},
  };

  const globalObject = {};
  initGlobalObject(globalObject, intrinsics, sharedGlobalPropertyNames, {});

  t.ok(globalObject instanceof Object);
  t.equal(Object.getPrototypeOf(globalObject), Object.prototype);
  t.ok(!Object.isFrozen(globalObject));
  t.notEqual(globalObject, globalThis);
  t.equal(globalObject.globalThis, globalObject);

  t.equals(Object.getOwnPropertyNames(globalObject).length, 7);

  const descs = Object.getOwnPropertyDescriptors(globalObject);
  for (const [name, desc] of Object.entries(descs)) {
    if (name === 'Infinity') {
      // eslint-disable-next-line no-restricted-globals
      t.ok(!isFinite(desc.value), `${name} should be Infinity`);
    } else if (name === 'NaN') {
      // eslint-disable-next-line no-restricted-globals
      t.ok(isNaN(desc.value), `${name} should be NaN`);
    } else if (name === 'undefined') {
      t.equal(desc.value, undefined, `${name} should be undefined`);
    } else if (['eval', 'Function', 'globalThis'].includes(name)) {
      t.notEqual(
        desc.value,
        intrinsics[name],
        `${name} should not be the intrinsics ${name}`,
      );
      t.notEqual(
        desc.value,
        globalThis[name],
        `${name} should not be the global ${name}`,
      );
    }

    if (['Infinity', 'NaN', 'undefined'].includes(name)) {
      t.notOk(desc.configurable, `${name} should not be configurable`);
      t.notOk(desc.writable, `${name} should not be writable`);
      t.notOk(desc.enumerable, `${name} should not be enumerable`);
    } else {
      t.ok(desc.configurable, `${name} should be configurable`);
      t.ok(desc.writable, `${name} should be writable`);
      t.notOk(desc.enumerable, `${name} should not be enumerable`);
    }
  }

  sinon.restore();

  t.end();
});
