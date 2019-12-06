import test from 'tape';
import sinon from 'sinon';
import { createGlobalObject } from '../../src/globalObject';

test('globalObject', t => {
  t.plan(32);

  // Mimic repairFunctions.
  // eslint-disable-next-line no-proto
  sinon.stub(Function.__proto__, 'constructor').callsFake(() => {
    throw new TypeError();
  });

  // eslint-disable-next-line no-new-func
  const unsafeGlobal = Function('return this;')();
  const realmRec = {
    intrinsics: {
      Date: {},
      eval: unsafeGlobal.eval,
      Function: unsafeGlobal.Function,
    },
  };

  const globalObject = createGlobalObject(realmRec, {});

  t.ok(globalObject instanceof Object);
  t.equal(Object.getPrototypeOf(globalObject), Object.prototype);
  t.ok(!Object.isFrozen(globalObject));
  t.notEqual(globalObject, unsafeGlobal);

  t.equals(Object.getOwnPropertyNames(globalObject).length, 6);

  for (const name of Object.getOwnPropertyNames(globalObject)) {
    const desc = Object.getOwnPropertyDescriptor(globalObject, name);

    if (name === 'Infinity') {
      // eslint-disable-next-line no-restricted-globals
      t.ok(!isFinite(desc.value), `${name} should be Infinity`);
    } else if (name === 'NaN') {
      // eslint-disable-next-line no-restricted-globals
      t.ok(isNaN(desc.value), `${name} should be NaN`);
    } else if (name === 'undefined') {
      t.equal(desc.value, undefined, `${name} should be undefined`);
    } else if (['eval', 'Function'].includes(name)) {
      t.notEqual(
        desc.value,
        realmRec.intrinsics[name],
        `${name} should not be the intrinsics ${name}`,
      );
      t.notEqual(
        desc.value,
        unsafeGlobal[name],
        `${name} should not be the global ${name}`,
      );
    } else {
      t.equal(
        desc.value,
        realmRec.intrinsics[name],
        `${name} should be the intrinsics ${name}`,
      );
      t.notEqual(
        desc.value,
        unsafeGlobal[name],
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
});
