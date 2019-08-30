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
        global: { Array: { prototype: { slice: true } } },
      },
    });
    t.deepEqual(
      sesSingle.evaluate(`(${testContent})`)(),
      ['yum'],
      'can override single Array.slice repair',
    );

    const sesProto = SES.makeSESRootRealm({
      dataPropertiesToRepair: {
        global: { Array: { prototype: '*' } },
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
