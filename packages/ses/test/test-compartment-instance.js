import test from 'ava';
import '../index.js';

test('Compartment instance', t => {
  t.plan(12);

  const c = new Compartment();

  t.truthy(c.globalThis.eval && Object.isFrozen(c.globalThis.eval));
  t.truthy(c.globalThis.Function && Object.isFrozen(c.globalThis.Function));
  t.truthy(
    c.globalThis.Compartment && Object.isFrozen(c.globalThis.Compartment),
  );

  t.is(typeof c, 'object', 'typeof');
  t.truthy(c instanceof Compartment, 'instanceof');
  t.not(c.constructor, Compartment, 'function Compartment() { [native code] }');

  t.is(
    Object.getPrototypeOf(c),
    Compartment.prototype,
    'Object.getPrototypeOf()',
  );
  t.truthy(
    // eslint-disable-next-line no-prototype-builtins
    Compartment.prototype.isPrototypeOf(c),
    'Compartment.prototype.isPrototypeOf()',
  );

  t.is(c.toString(), '[object Compartment]', 'toString()');
  t.is(c[Symbol.toStringTag], undefined, '"Symbol.toStringTag" property');

  t.deepEqual(Reflect.ownKeys(c), [], 'static properties');
  t.deepEqual(
    Reflect.ownKeys(Object.getPrototypeOf(c)).sort(),
    [
      'constructor',
      'evaluate',
      'globalThis',
      'import',
      'importNow',
      'load',
      'module',
      'name',
      'toString',
    ].sort(),
    'prototype properties',
  );
});
