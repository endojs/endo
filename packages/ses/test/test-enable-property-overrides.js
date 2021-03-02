import test from 'ava';
import { captureGlobals } from '@agoric/test262-runner';

import makeHardener from '@agoric/make-hardener';
import {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
} from '../src/commons.js';
import tameErrorConstructor from '../src/error/tame-error-constructor.js';
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

  // Ava assigns to Error.stackTraceLimit. If we don't tame the Error
  // constructor prior to the harden, then ava's internal assignment
  // fails. We tame it as if
  // { errorTaming: 'unsafe', stackFiltering: 'verbose' }
  // to get more information back from ava.
  // TODO on non-v8 this taming does not leave an assignable
  // stackTraceLimit. Ava will probably fail there in the
  // same assignment.
  globalThis.Error = tameErrorConstructor('unsafe', 'verbose')[
    '%InitialError%'
  ];

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

  testOverriding(t, 'Object', {}, ['hasOwnProperty', 'toString', 'valueOf']);
  // We allow 'length' *not* because it is in enablements; it is not;
  // but because each array instance has its own.
  testOverriding(t, 'Array', [], ['toString', 'length', 'push']);
  // eslint-disable-next-line func-names
  testOverriding(t, 'Function', function() {}, [
    'constructor',
    'bind',
    'toString',
  ]);
  testOverriding(t, 'Error', new Error(), [
    'constructor',
    'message',
    'name',
    'toString',
  ]);
  testOverriding(t, 'TypeError', new TypeError(), [
    'constructor',
    'message',
    'name',
  ]);
  // eslint-disable-next-line func-names
  testOverriding(t, 'Promise', new Promise(function() {}), ['constructor']);
  testOverriding(t, 'JSON', JSON);

  restore();
});

// TODO test optional parameters
