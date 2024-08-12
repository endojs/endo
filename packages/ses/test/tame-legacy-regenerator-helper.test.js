import test from 'ava';
import '../index.js';

lockdown({ legacyRegeneratorRuntimeTaming: 'unsafe-ignore' });

test('lockdown Iterator.prototype[@@iterator] is tamed', t => {
  const IteratorProto = Object.getPrototypeOf(
    Object.getPrototypeOf([].values()),
  );
  const desc = Object.getOwnPropertyDescriptor(IteratorProto, Symbol.iterator);
  if (!desc || !desc.get || !desc.set) throw new Error('unreachable');
  t.is(desc.configurable || desc.enumerable, false);
  t.is(desc.value, undefined);

  const { get, set } = desc;
  t.is(
    Function.prototype.toString.call(get),
    'function get() { [native code] }',
  );
  t.is(
    Function.prototype.toString.call(set),
    'function set() { [native code] }',
  );

  const child = Object.create(IteratorProto);
  child[Symbol.iterator] = 'foo'; // override test
  t.is(child[Symbol.iterator], 'foo');

  const native = get();
  IteratorProto[Symbol.iterator] = function () {
    return this;
  };
  t.is(get(), native);
  t.is(
    Function.prototype.toString.call(native),
    'function [Symbol.iterator]() { [native code] }',
  );
});

test('lockdown Iterator.prototype[@@iterator] is tamed in Compartments', t => {
  const c = new Compartment();
  const compartmentIteratorProto = Object.getPrototypeOf(
    Object.getPrototypeOf(c.globalThis.Array().values()),
  );
  t.is(
    compartmentIteratorProto,
    Object.getPrototypeOf(Object.getPrototypeOf([].values())),
  );
  const parentFunction = /** @type {any} */ (
    Object.getOwnPropertyDescriptor(compartmentIteratorProto, Symbol.iterator)
  ).get.constructor;
  t.throws(() => Reflect.construct(parentFunction, ['return globalThis']));
});
