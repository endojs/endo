import test from 'ava';
import { captureGlobals } from '@agoric/test262-runner';

import makeHardener from '@agoric/make-hardener';
import {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
} from '../src/commons.js';
import enablePropertyOverrides from '../src/enable-property-overrides.js';

function getValue(obj, name) {
  const desc = getOwnPropertyDescriptor(obj, name);
  return desc && desc.value;
}

function testOverriding(t, type, obj, allowed = []) {
  const proto = getPrototypeOf(obj);
  for (const name of getOwnPropertyNames(proto)) {
    if (name === '__proto__') {
      t.notThrows(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.not(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    } else if (allowed.includes(name)) {
      t.notThrows(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.is(
        getValue(obj, name),
        1,
        `Should allow setting property ${name} of ${type} instance`,
      );
    } else {
      t.throws(
        () => {
          obj[name] = 1;
        },
        undefined,
        `Should throw when setting property ${name} of ${type} instance`,
      );
      t.not(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    }
  }
}

test('enablePropertyOverrides - on', t => {
  const restore = captureGlobals(
    'Object',
    'Array',
    'Function',
    'Error',
    'Promise',
    'JSON',
  );

  const intrinsics = {
    '%ObjectPrototype%': Object.prototype,
    '%ArrayPrototype%': Array.prototype,
    '%FunctionPrototype%': Function.prototype,
    '%ErrorPrototype%': Error.prototype,
    '%TypeErrorPrototype%': TypeError.prototype,
    '%PromisePrototype%': Promise.prototype,
    JSON,
  };

  enablePropertyOverrides(intrinsics, 'moderate');

  const harden = makeHardener();
  harden(intrinsics);

  testOverriding(t, 'Object', {}, getOwnPropertyNames(Object.prototype));
  testOverriding(t, 'Array', [], getOwnPropertyNames(Array.prototype));
  // eslint-disable-next-line func-names
  testOverriding(t, 'Function', function() {}, [
    'constructor',
    // 'name', // TODO
    'bind',
    'toString',
  ]);
  testOverriding(t, 'Error', new Error(), [
    'constructor',
    'name',
    'message',
    'toString',
  ]);
  testOverriding(t, 'TypeError', new TypeError(), [
    'constructor',
    'name',
    'message',
  ]);
  // eslint-disable-next-line func-names
  testOverriding(t, 'Promise', new Promise(function() {}), ['constructor']);
  testOverriding(t, 'JSON', JSON);

  restore();
});

// TODO test optional parameters
