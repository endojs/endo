import test from 'ava';
import { encapsulateHostConstructor } from '../src/encapsulate-host-constructor.js';

const makeHostConstructor = () => {
  return function HostConstructor() {};
};

const assertDiagnostic = (t, HostConstructor, name) => {
  const error = t.throws(() =>
    encapsulateHostConstructor(HostConstructor, name),
  );
  t.is(error.constructor, TypeError);
  t.regex(error.message, new RegExp(`Cannot tame ${name}`));
  t.is(error.cause?.constructor, TypeError);
};

test('encapsulateHostConstructor rejects a frozen prototype', t => {
  const HostConstructor = makeHostConstructor();
  Object.freeze(HostConstructor.prototype);
  assertDiagnostic(t, HostConstructor, 'FrozenHost');
});

test('encapsulateHostConstructor rejects a nonextensible prototype without an own constructor', t => {
  const HostConstructor = makeHostConstructor();
  delete HostConstructor.prototype.constructor;
  Object.preventExtensions(HostConstructor.prototype);
  assertDiagnostic(t, HostConstructor, 'NonextensibleHost');
});

test('encapsulateHostConstructor rejects a nonconfigurable constructor', t => {
  const HostConstructor = makeHostConstructor();
  Object.defineProperty(HostConstructor.prototype, 'constructor', {
    writable: false,
    configurable: false,
  });
  assertDiagnostic(t, HostConstructor, 'NonconfigurableHost');
});

test('encapsulateHostConstructor preserves construction behavior', t => {
  const HostConstructor = function HostConstructor(value) {
    this.value = value;
  };
  const EncapsulatedConstructor = encapsulateHostConstructor(
    HostConstructor,
    'EncapsulatedConstructor',
  );
  const Constructable = /** @type {typeof HostConstructor} */ (
    EncapsulatedConstructor
  );

  const instance = new Constructable(42);
  t.true(instance instanceof HostConstructor);
  t.true(instance instanceof EncapsulatedConstructor);
  t.is(instance.value, 42);
  t.is(HostConstructor.prototype.constructor, EncapsulatedConstructor);
  t.deepEqual(Reflect.ownKeys(EncapsulatedConstructor), [
    'length',
    'name',
    'prototype',
  ]);
  t.is(EncapsulatedConstructor.length, HostConstructor.length);
  t.throws(() => EncapsulatedConstructor(), {
    instanceOf: TypeError,
    message: 'Calling EncapsulatedConstructor constructor as a function throws',
  });
});
