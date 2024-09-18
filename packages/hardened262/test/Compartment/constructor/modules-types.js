/*---
description: |
  Currently failing with SES, pending work to fix.
flags: [onlyStrict,noSesXs,noSesNode]
---*/

function check(modules) {
  return function () {
    return new Compartment({ modules, __options__: true }).toString();
  };
}

assert.sameValue(
  new Compartment().toString(),
  '[object Compartment]',
  'no options',
);
assert.sameValue(
  new Compartment({ __options__: true, modules: {} }).toString(),
  '[object Compartment]',
  'no modules',
);

assert.sameValue(
  new Compartment().toString(),
  '[object Compartment]',
  'no options',
);
assert.sameValue(
  new Compartment({ __options__: true }).toString(),
  '[object Compartment]',
  'no modules',
);
assert.sameValue(
  new Compartment({ __options__: true, modules: {} }).toString(),
  '[object Compartment]',
  'no modules',
);

assert.throws(TypeError, check(undefined), 'undefined');
assert.throws(TypeError, check(null), 'null');
assert.throws(TypeError, check(false), 'boolean');
assert.throws(TypeError, check(0), 'number');
assert.throws(TypeError, check(''), 'string');
assert.throws(TypeError, check(Symbol()), 'symbol');
assert.sameValue(check({})(), '[object Compartment]', 'object');
assert.sameValue(check([])(), '[object Compartment]', 'array');

function checkProperty(value) {
  return function () {
    const c = new Compartment({
      __options__: true,
      modules: {
        foo: value,
      },
    });
  };
}

assert.throws(TypeError, checkProperty(null), 'null');
assert.throws(TypeError, checkProperty(false), 'boolean');
assert.throws(TypeError, checkProperty(0), 'number');
assert.throws(TypeError, checkProperty(''), 'string');
assert.throws(TypeError, checkProperty(Symbol()), 'symbol');
assert.throws(TypeError, checkProperty({}), 'object');
assert.throws(TypeError, checkProperty([]), 'array');
assert.throws(TypeError, checkProperty(new Proxy({}, {})), 'proxy');
