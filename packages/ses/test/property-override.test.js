/* global Compartment, lockdown */
/* eslint-disable max-classes-per-file, no-inner-declarations */
import test from 'tape';
import '../src/main.js';

lockdown();

test('Can assign "toString" of constructor prototype', t => {
  const c = new Compartment();

  function testContent() {
    function Animal() {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }

  try {
    const result = c.evaluate(`(${testContent})`)();
    t.equal(result, 'moo');
  } catch (err) {
    t.fail(err);
  }

  t.end();
});

test('Can assign "toString" of class prototype', t => {
  const c = new Compartment();

  function testContent() {
    class Animal {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }

  try {
    const result = c.evaluate(`(${testContent})`)();
    t.equal(result, 'moo');
  } catch (err) {
    t.fail(err);
  }
  t.end();
});

test('Can assign "slice" of Array-inherited class prototype', t => {
  const c = new Compartment();
  function testContent() {
    class Pizza extends Array {}
    Pizza.prototype.slice = () => ['yum'];
    const pizza = new Pizza();
    return pizza.slice();
  }
  try {
    const result = c.evaluate(`(${testContent})`)();
    t.deepEqual(result, ['yum']);
  } catch (err) {
    t.fail(err);
  }
  t.end();
});

test('packages in-the-wild', t => {
  try {
    const c = new Compartment();

    function testContent0() {
      function* X() {
        // empty
      }
      X.constructor = function XConstructor() {};
    }

    t.doesNotThrow(
      () => c.evaluate(`(${testContent0})`)(),
      'generator function constructor',
    );

    function testContent1() {
      function X() {
        // empty
      }
      X.constructor = function XConstructor() {};
    }

    t.doesNotThrow(
      () => c.evaluate(`(${testContent1})`)(),
      'regenerator-runtime: generator function constructor',
    );

    function testContent2() {
      function IllegalArgumentError(message) {
        Error.call(this, message);
        this.message = message;
      }

      // These are the semantics of util.inherits according to
      // https://nodejs.org/docs/latest/api/util.html#util_util_inherits_constructor_superconstructor
      Object.setPrototypeOf(IllegalArgumentError.prototype, Error.prototype);
      // eslint-disable-next-line no-underscore-dangle
      IllegalArgumentError.super_ = Error;
      IllegalArgumentError.prototype.name = 'IllegalArgumentError';
    }

    t.doesNotThrow(
      () => c.evaluate(`(${testContent2})`)(),
      'precond error subclass name',
    );

    function testContent3() {
      const err = Error();
      err.constructor = function ErrConstructor() {};
    }
    t.doesNotThrow(
      () => c.evaluate(`(${testContent3})`)(),
      'fast-json-patch error instance constructor',
    );

    function testContent4() {
      function fn() {}
      fn.bind = function empty() {};
    }
    t.doesNotThrow(
      () => c.evaluate(`(${testContent4})`)(),
      `underscore function instance bind`,
    );

    function testContent5() {
      const p = new Promise(() => {});
      p.constructor = function PConstructor() {};
    }
    t.doesNotThrow(
      () => c.evaluate(`(${testContent5})`)(),
      `core-js promise instance constructor`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

/* eslint-enable max-classes-per-file, no-inner-declarations */
