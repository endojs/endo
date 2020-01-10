/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('lockdown() Math allowed - Math from Evaluator is tamed', t => {
  const s = new Evaluator();
  t.throws(() => s.evaluate('Math.random()'));
  t.end();
});

test('lockdown() Math allowed - Math from nested Evaluator is tamed', t => {
  const s = new Evaluator().evaluate('new Evaluator()');
  t.throws(() => s.evaluate('Math.random()'));
  t.end();
});
