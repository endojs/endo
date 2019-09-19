import test from 'tape';
import Realm from '../../src/realm';

test('Reflect.constructor should not leak primal realm prototypes via setting Function.prototype to null', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  const obj = r.evaluate(`
  	Function.prototype = null;
  	Reflect.construct(Object, [], Function);
  `);

  t.notOk(obj instanceof Object, "should not be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});

test('Reflect.constructor should not leak primal realm prototypes via hiding Function.prototype', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  const obj = r.evaluate(`
  	const proxy = new Proxy(Function, { get: (target, prop) => prop === 'prototype' ? null : target[prop] });
  	Reflect.construct(Object, [], proxy);
  `);

  t.notOk(obj instanceof Object, "should not be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});

test('Reflect.constructor should not leak primal realm prototypes via a new function from Function.bind()', t => {
  t.plan(2);

  const r = Realm.makeRootRealm();

  const obj = r.evaluate(`
  	const fn = Function.bind();
  	Reflect.construct(Object, [], fn);
  `);

  t.notOk(obj instanceof Object, "should not be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});
