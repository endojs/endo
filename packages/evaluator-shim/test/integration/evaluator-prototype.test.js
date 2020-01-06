import tap from 'tap';
import Evaluator from '../../src/main.js';

const { test } = tap;

test('Evaluator prototype', t => {
  t.plan(2);

  t.equals(
    Evaluator.prototype.constructor,
    Evaluator,
    'The initial value of Evaluator.prototype.constructor',
  );

  t.deepEqual(
    Reflect.ownKeys(Evaluator.prototype).sort(),
    ['constructor', 'evaluate', 'global', 'toString'].sort(),
    'prototype properties',
  );
});
