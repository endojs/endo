import test from 'tape';
import Evaluator from '../../src/evaluator';

test('Evaluator prototype', t => {
  t.plan(2);

  t.equals(
    Evaluator.prototype.constructor,
    Evaluator,
    'The initial value of Evaluator.prototype.constructor',
  );

  t.deepEqual(
    Reflect.ownKeys(Evaluator.prototype).sort(),
    ['constructor', 'evaluateScript', 'global', 'toString'].sort(),
    'prototype properties',
  );
});
