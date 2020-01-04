import test from 'tape';
import { captureGlobals } from '@agoric/test262-runner';
import makeHardener from '@agoric/make-hardener';
import enablePropertyOverride from '../src/main';

const {
  getPrototypeOf,
  getOwnPropertyDescriptor,
  getOwnPropertyNames,
} = Object;

function getValue(obj, name) {
  const desc = getOwnPropertyDescriptor(obj, name);
  return desc && desc.value;
}

function testOverriding(t, type, obj, allowed = []) {
  const proto = getPrototypeOf(obj);
  for (const name of getOwnPropertyNames(proto)) {
    if (name === '__proto__') {
      t.doesNotThrow(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.notEqual(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    } else if (allowed.includes(name)) {
      t.doesNotThrow(() => {
        obj[name] = 1;
      }, `Should not throw when setting property ${name} of ${type} instance`);
      t.equal(
        getValue(obj, name),
        1,
        `Should allow setting property ${name} of ${type} instance`,
      );
    } else {
      t.throws(() => {
        obj[name] = 1;
      }, `Should throw when setting property ${name} of ${type} instance`);
      t.notEqual(
        getValue(obj, name),
        1,
        `Should not allow setting property ${name} of ${type} instance`,
      );
    }
  }
}

test('enablePropertyOverride - on', t => {
  const restore = captureGlobals(
    'Object',
    'Array',
    'Function',
    'Error',
    'Promise',
    'JSON',
  );

  const namedIntrinsics = { Object, Array, Function, Error, Promise, JSON };

  enablePropertyOverride({ namedIntrinsics });

  const harden = makeHardener();
  harden({ namedIntrinsics });

  testOverriding(t, 'Object', {}, getOwnPropertyNames(Object.prototype));
  testOverriding(t, 'Array', [], getOwnPropertyNames(Array.prototype));
  // eslint-disable-next-line func-names
  testOverriding(t, 'Function', function() {}, [
    'constructor',
    // 'name', // TODO
    'bind',
    'toString',
  ]);
  testOverriding(t, 'Error', new Error(), ['constructor', 'name', 'message']);
  // eslint-disable-next-line func-names
  testOverriding(t, 'Promise', new Promise(function() {}), ['constructor']);
  testOverriding(t, 'JSON', JSON);

  restore();
  t.end();
});
