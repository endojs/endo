/* global Evaluator */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('nested realms should work at all', t => {
  const s1 = new Evaluator();
  const s2 = s1.evaluate('new Evaluator()');
  t.equal(s2.evaluate('1+2'), 3);
  const s3 = s2.evaluate('new Evaluator()');
  t.equal(s3.evaluate('1+2'), 3);
  t.end();
});
