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
