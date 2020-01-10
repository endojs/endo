/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown({ mathMode: 'allow' });

test('lockdown() Math allowed - Math from Evaluator is not tamed', t => {
  const s = new Evaluator();
  const random = s.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});

test('lockdown() Math allowed - Math from nested Evaluator is not tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');
  const random = s.evaluate('Math.random()');
  t.equal(typeof random, 'number');
  t.notOk(Number.isNaN(random));
  t.end();
});
