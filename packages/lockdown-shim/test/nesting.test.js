/* global Compartment */
import test from 'tape';
import { lockdown } from '../src/main.js';

lockdown();

test('nested realms should work at all', t => {
  const c1 = new Compartment();
  const c2 = c1.evaluate('new Compartment()');
  t.equal(c2.evaluate('1+2'), 3);
  const c3 = c2.evaluate('new Compartment()');
  t.equal(c3.evaluate('1+2'), 3);
  t.end();
});
