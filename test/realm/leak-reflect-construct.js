import test from 'tape';
import Evaluator from '../../src/evaluator';

test('Reflect.constructor should not leak primal realm prototypes via setting Function.prototype to null', t => {
  t.plan(2);

  const r = new Evaluator();

  const obj = r.evaluate(`
  	Function.prototype = null;
  	Reflect.construct(Object, [], Function);
  `);

  t.ok(obj instanceof Object, "should be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});

test('Reflect.constructor should not leak primal realm prototypes via hiding Function.prototype', t => {
  t.plan(2);

  const r = new Evaluator();

  const obj = r.evaluate(`
  	const proxy = new Proxy(Function, { get: (target, prop) => prop === 'prototype' ? null : target[prop] });
  	Reflect.construct(Object, [], proxy);
  `);

  t.ok(obj instanceof Object, "should be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});

test('Reflect.constructor should not leak primal realm prototypes via a new function from Function.bind()', t => {
  t.plan(2);

  const r = new Evaluator();

  const obj = r.evaluate(`
  	const fn = Function.bind();
  	Reflect.construct(Object, [], fn);
  `);

  t.ok(obj instanceof Object, "should be parent's realm Object");
  t.ok(obj instanceof r.global.Object);
});
