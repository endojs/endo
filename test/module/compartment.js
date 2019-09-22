import test from 'tape';
import Evaluator from '../../src/evaluator';

test('new Evaluator - class', t => {
  t.plan(3);

  t.equals(Evaluator.toString(), 'function Evaluator() { [shim code] }');

  const staticKeys = Reflect.ownKeys(Evaluator);

  t.deepEqual(
    staticKeys.sort(),
    ['length', 'name', 'prototype', 'toString'].sort()
  );

  const prototypeKeys = Reflect.ownKeys(Evaluator.prototype);

  t.deepEqual(
    prototypeKeys.sort(),
    ['constructor', 'evaluate', 'global', 'toString'].sort()
  );
});

test('new Evaluator - instance', t => {
  t.plan(6);

  t.throws(() => Evaluator(), TypeError);

  const evaluator = new Evaluator();

  t.ok(evaluator instanceof Evaluator);
  t.equals(Object.getPrototypeOf(evaluator), Evaluator.prototype);
  t.equals(evaluator.toString(), '[object Evaluator]');

  const instanceKeys = Reflect.ownKeys(evaluator);

  t.deepEqual(instanceKeys, []);

  const protoKeys = Reflect.ownKeys(Object.getPrototypeOf(evaluator));

  t.deepEqual(
    protoKeys.sort(),
    ['constructor', 'evaluate', 'global', 'toString'].sort()
  );
});
