/* eslint-disable no-inner-declarations */
import test from 'tape';
import SES from '../src/index';

test('Can assign "toString" of constructor prototype', t => {
  const s = SES.makeSESRootRealm();
  function testContent() {
    function Animal() {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }
  try {
    const result = s.evaluate(`(${testContent})`)();
    t.equal(result, 'moo');
  } catch (err) {
    t.fail(err);
  }
  t.end();
});

test('Can assign "toString" of class prototype', t => {
  const s = SES.makeSESRootRealm();
  function testContent() {
    class Animal {}
    Animal.prototype.toString = () => 'moo';
    const animal = new Animal();
    return animal.toString();
  }
  try {
    const result = s.evaluate(`(${testContent})`)();
    t.equal(result, 'moo');
  } catch (err) {
    t.fail(err);
  }
  t.end();
});

test('override options.dataPropertiesToRepair', t => {
  try {
    // eslint-disable-next-line no-inner-declarations
    function testContent() {
      class Pizza extends Array {}
      Pizza.prototype.slice = () => ['yum'];
      const pizza = new Pizza();
      return pizza.slice();
    }

    const sesNone = SES.makeSESRootRealm({ dataPropertiesToRepair: false });
    t.throws(
      () => sesNone.evaluate(`(${testContent})`)(),
      sesNone.global.TypeError,
      'cannot override unrepaired Array.slice',
    );

    const sesSingle = SES.makeSESRootRealm({
      dataPropertiesToRepair: {
        namedIntrinsics: { Array: { prototype: { slice: true } } },
      },
    });
    t.deepEqual(
      sesSingle.evaluate(`(${testContent})`)(),
      ['yum'],
      'can override single Array.slice repair',
    );

    const sesProto = SES.makeSESRootRealm({
      dataPropertiesToRepair: {
        namedIntrinsics: { Array: { prototype: '*' } },
      },
    });
    t.deepEqual(
      sesProto.evaluate(`(${testContent})`)(),
      ['yum'],
      'can override Array.prototype.* repair',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('Can assign "slice" of Array-inherited class prototype', t => {
  const s = SES.makeSESRootRealm();
  function testContent() {
    class Pizza extends Array {}
    Pizza.prototype.slice = () => ['yum'];
    const pizza = new Pizza();
    return pizza.slice();
  }
  try {
    const result = s.evaluate(`(${testContent})`)();
    t.deepEqual(result, ['yum']);
  } catch (err) {
    t.fail(err);
  }
  t.end();
});

test('invalid repair plan', t => {
  try {
    t.throws(
      () =>
        SES.makeSESRootRealm({
          dataPropertiesToRepair: { namedIntrinsics: { Error: 'all' } },
        }),
      /TypeError/,
      'rejected "all" repair plan',
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});

test('packages in-the-wild', t => {
  try {
    const s = SES.makeSESRootRealm();

    function testContent1() {
      function* X() {
        // empty
      }
      X.constructor = function XConstructor() {};
    }

    t.doesNotThrow(
      () => s.evaluate(`(${testContent1})`)(),
      'regenerator-runtime generator function constructor',
    );

    function testContent2() {
      function IllegalArgumentError(message) {
        Error.call(this, message);
        this.message = message;
      }

      Object.setPrototypeOf(IllegalArgumentError.prototype, Error.prototype);
      IllegalArgumentError.prototype.name = 'IllegalArgumentError';
    }

    t.doesNotThrow(
      () => s.evaluate(`(${testContent2})`)(),
      'precond error subclass name',
    );

    function testContent3() {
      const err = Error();
      err.constructor = function ErrConstructor() {};
    }
    t.doesNotThrow(
      () => s.evaluate(`(${testContent3})`)(),
      'fast-json-patch error instance constructor',
    );

    function testContent4() {
      function fn() {}
      fn.bind = function empty() {};
    }
    t.doesNotThrow(
      () => s.evaluate(`(${testContent4})`)(),
      `underscore function instance bind`,
    );

    function testContent5() {
      const p = new Promise(() => {});
      p.constructor = function PConstructor() {};
    }
    t.doesNotThrow(
      () => s.evaluate(`(${testContent5})`)(),
      `core-js promise instance constructor`,
    );
  } catch (e) {
    t.isNot(e, e, 'unexpected exception');
  } finally {
    t.end();
  }
});
